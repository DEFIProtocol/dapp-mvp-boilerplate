import express from "express";
import fs from "fs";
import path from "path";

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

interface ExecutionLedgerRow {
	step: number;
	eventType: string;
	trader: string;
	counterparty?: string;
	agentType: string;
	side: string;
	exposure: number;
	leverage: number;
	reason: string;
}

interface AgentActivityRow {
	agentType: string;
	intents: number;
	filled: number;
	failed: number;
	cancelled: number;
	liquidations: number;
	fillRatePercent: number;
	intentNotional: number;
	filledNotional: number;
}

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

function toNumber(value: string | undefined): number {
	if (!value) return 0;
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : 0;
}

function parseCsv(filePath: string): string[][] {
	if (!fs.existsSync(filePath)) return [];
	const content = fs.readFileSync(filePath, "utf8").trim();
	if (!content) return [];
	return content
		.split(/\r?\n/)
		.map((line) => line.split(","));
}

function getLatestRunId(baseDir: string): string | null {
	if (!fs.existsSync(baseDir)) return null;

	const dirs = fs
		.readdirSync(baseDir, { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.map((entry) => ({
			id: entry.name,
			mtime: fs.statSync(path.join(baseDir, entry.name)).mtime.getTime(),
		}))
		.sort((left, right) => right.mtime - left.mtime);

	return dirs.length > 0 ? dirs[0].id : null;
}

function readDiagnostics(baseDir: string, runId: string, limit: number, step?: number) {
	const runDir = path.join(baseDir, runId);
	const executionPath = path.join(runDir, "execution_ledger.csv");
	const agentActivityPath = path.join(runDir, "agent_activity.csv");

	const executionRows = parseCsv(executionPath);
	const executionData = executionRows.slice(1).map((columns): ExecutionLedgerRow => ({
		step: toNumber(columns[0]),
		eventType: columns[1] ?? "",
		trader: columns[2] ?? "",
		counterparty: columns[3] || undefined,
		agentType: columns[4] ?? "",
		side: columns[5] ?? "",
		exposure: toNumber(columns[6]),
		leverage: toNumber(columns[7]),
		reason: columns[8] ?? "",
	}));

	const filteredByStep = typeof step === "number"
		? executionData.filter((row) => row.step === step)
		: executionData;

	const safeLimit = Math.max(1, Math.min(limit, 5000));
	const executionLedger = filteredByStep.slice(0, safeLimit);

	const agentRows = parseCsv(agentActivityPath);
	const agentActivity = agentRows.slice(1).map((columns): AgentActivityRow => ({
		agentType: columns[0] ?? "",
		intents: toNumber(columns[1]),
		filled: toNumber(columns[2]),
		failed: toNumber(columns[3]),
		cancelled: toNumber(columns[4]),
		liquidations: toNumber(columns[5]),
		fillRatePercent: toNumber(columns[6]),
		intentNotional: toNumber(columns[7]),
		filledNotional: toNumber(columns[8]),
	}));

	return {
		runId,
		executionLedger,
		agentActivity,
		meta: {
			totalEvents: executionData.length,
			returnedEvents: executionLedger.length,
			step: typeof step === "number" ? step : null,
			limit: safeLimit,
			hasExecutionLedger: fs.existsSync(executionPath),
			hasAgentActivity: fs.existsSync(agentActivityPath),
		},
	};
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

	router.get("/runs/:id/diagnostics", (req, res) => {
		try {
			const baseDir = resolveSimulationResultsDir();
			const runDir = path.join(baseDir, req.params.id);

			if (!fs.existsSync(runDir)) {
				return res.status(404).json({
					error: "Simulation run not found",
					id: req.params.id,
				});
			}

			const limit = toNumber(typeof req.query.limit === "string" ? req.query.limit : undefined) || 1000;
			const rawStep = typeof req.query.step === "string" ? req.query.step : undefined;
			const step = rawStep !== undefined ? toNumber(rawStep) : undefined;

			return res.json(readDiagnostics(baseDir, req.params.id, limit, step));
		} catch (error) {
			console.error("Error reading simulation diagnostics:", error);
			return res.status(500).json({
				error: error instanceof Error ? error.message : "Failed to read simulation diagnostics",
			});
		}
	});

	router.get("/latest/diagnostics", (req, res) => {
		try {
			const baseDir = resolveSimulationResultsDir();
			const latestRunId = getLatestRunId(baseDir);

			if (!latestRunId) {
				return res.status(404).json({
					error: "No simulation runs found",
				});
			}

			const limit = toNumber(typeof req.query.limit === "string" ? req.query.limit : undefined) || 1000;
			const rawStep = typeof req.query.step === "string" ? req.query.step : undefined;
			const step = rawStep !== undefined ? toNumber(rawStep) : undefined;

			return res.json(readDiagnostics(baseDir, latestRunId, limit, step));
		} catch (error) {
			console.error("Error reading latest simulation diagnostics:", error);
			return res.status(500).json({
				error: error instanceof Error ? error.message : "Failed to read latest simulation diagnostics",
			});
		}
	});

	return router;
}
