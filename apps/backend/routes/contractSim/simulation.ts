import express from "express";
import fs from "fs";
import path from "path";

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

function resolveSimulationResultsDir(): string {
	const candidates = [
		path.resolve(process.cwd(), "apps/contracts/simulation-results"),
		path.resolve(process.cwd(), "../contracts/simulation-results"),
		path.resolve(process.cwd(), "contracts/simulation-results"),
	];

	for (const candidate of candidates) {
		if (fs.existsSync(candidate)) return candidate;
	}

	return candidates[0];
}

function readJsonFile(filePath: string): JsonValue {
	const content = fs.readFileSync(filePath, "utf8");
	return JSON.parse(content) as JsonValue;
}

export default function contractSimulationRouter() {
	const router = express.Router();

	router.get("/health", (_req, res) => {
		const baseDir = resolveSimulationResultsDir();
		res.json({
			ok: true,
			simulationResultsDir: baseDir,
			exists: fs.existsSync(baseDir),
		});
	});

	router.get("/latest", (_req, res) => {
		try {
			const baseDir = resolveSimulationResultsDir();
			const latestPath = path.join(baseDir, "latest.json");

			if (!fs.existsSync(latestPath)) {
				return res.status(404).json({
					error: "No latest simulation replay found",
					path: latestPath,
				});
			}

			return res.json(readJsonFile(latestPath));
		} catch (error) {
			console.error("Error reading latest simulation replay:", error);
			return res.status(500).json({
				error: error instanceof Error ? error.message : "Failed to read latest simulation replay",
			});
		}
	});

	router.get("/runs", (_req, res) => {
		try {
			const baseDir = resolveSimulationResultsDir();
			if (!fs.existsSync(baseDir)) {
				return res.json({ runs: [] });
			}

			const runs = fs
				.readdirSync(baseDir, { withFileTypes: true })
				.filter((entry) => entry.isDirectory())
				.map((entry) => {
					const runDir = path.join(baseDir, entry.name);
					const completePath = path.join(runDir, "simulation_complete.json");
					const summaryPath = path.join(runDir, "summary.txt");
					const createdAt = fs.statSync(runDir).mtime.toISOString();

					let scenario: string | undefined;
					let seed: number | undefined;
					let metricCount: number | undefined;

					if (fs.existsSync(completePath)) {
						try {
							const parsed = readJsonFile(completePath) as any;
							scenario = parsed?.config?.scenario;
							seed = parsed?.config?.seed;
							metricCount = Array.isArray(parsed?.metrics) ? parsed.metrics.length : undefined;
						} catch {
							// Keep listing resilient even if one file is malformed.
						}
					}

					return {
						id: entry.name,
						createdAt,
						scenario,
						seed,
						metricCount,
						hasCompleteJson: fs.existsSync(completePath),
						hasSummary: fs.existsSync(summaryPath),
					};
				})
				.sort((left, right) => right.createdAt.localeCompare(left.createdAt));

			return res.json({ runs });
		} catch (error) {
			console.error("Error listing simulation runs:", error);
			return res.status(500).json({
				error: error instanceof Error ? error.message : "Failed to list simulation runs",
			});
		}
	});

	router.get("/runs/:id", (req, res) => {
		try {
			const baseDir = resolveSimulationResultsDir();
			const runPath = path.join(baseDir, req.params.id, "simulation_complete.json");

			if (!fs.existsSync(runPath)) {
				return res.status(404).json({
					error: "Simulation run not found",
					id: req.params.id,
				});
			}

			return res.json(readJsonFile(runPath));
		} catch (error) {
			console.error("Error reading simulation run:", error);
			return res.status(500).json({
				error: error instanceof Error ? error.message : "Failed to read simulation run",
			});
		}
	});

	router.get("/runs/:id/summary", (req, res) => {
		try {
			const baseDir = resolveSimulationResultsDir();
			const summaryPath = path.join(baseDir, req.params.id, "summary.txt");

			if (!fs.existsSync(summaryPath)) {
				return res.status(404).json({
					error: "Simulation summary not found",
					id: req.params.id,
				});
			}

			return res.type("text/plain").send(fs.readFileSync(summaryPath, "utf8"));
		} catch (error) {
			console.error("Error reading simulation summary:", error);
			return res.status(500).json({
				error: error instanceof Error ? error.message : "Failed to read simulation summary",
			});
		}
	});

	return router;
}
