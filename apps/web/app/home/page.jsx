import styles from "./page.module.css";
import fs from "node:fs";
import path from "node:path";

const principles = [
  {
    title: "Shelter from the storm",
    body:
      "When banks fail and borders close, the food still needs to move. The fuel still needs to flow. DCSN is the quiet layer beneath—ensuring nothing stops, even when the systems we trust do not.",
  },
  {
    title: "A promise to the future",
    body:
      "This belongs to no king, no corporation, no single country. It belongs to anyone who has ever wondered: what happens when the old world goes dark? We are building the answer.",
  },
  {
    title: "Your hands, healing the world",
    body:
      "Every load you deliver, every proof you verify, every contract you settle becomes a thread in something larger than yourself. This is not a job. This is a chance to matter.",
  },
];

const architecture = [
	{
		title: "Financial Layer",
		text: "Decentralized derivatives, unified margin, and escrow-based settlement to clear markets without centralized clearinghouses.",
	},
	{
		title: "Logistics Layer",
		text: "Permissionless load routing where approved operators can accept jobs by proximity, equipment, urgency, and price.",
	},
	{
		title: "Verification Layer",
		text: "Multi-party proofs of delivery and inventory backed by signatures, attestations, and auditability.",
	},
	{
		title: "Governance Layer",
		text: "DAO-controlled incentives, emergency protocols, role approvals, and transparent proposal execution.",
	},
];

const repoRoots = [
	process.cwd(),
	path.resolve(process.cwd(), ".."),
	path.resolve(process.cwd(), "..", ".."),
];

function resolveRepoRoot() {
	for (const candidate of repoRoots) {
		if (fs.existsSync(path.join(candidate, "zReadMe"))) {
			return candidate;
		}
	}
	return path.resolve(process.cwd(), "..", "..");
}

const repoRoot = resolveRepoRoot();

function readDoc(relativePath) {
	const absolutePath = path.join(repoRoot, relativePath);
	try {
		return fs.readFileSync(absolutePath, "utf8").replace(/\r\n/g, "\n").trim();
	} catch {
		return `Unable to load ${relativePath}`;
	}
}

const docs = [
	{
		id: "whitepaper",
		title: "White Paper",
		subtitle: "Full protocol vision and design",
		content: readDoc("zReadMe/governance/whitePaper/README.md"),
	},
	{
		id: "constitution",
		title: "DAO Constitution",
		subtitle: "Core governance authority and boundaries",
		content: readDoc("zReadMe/governance/DAOConstitution/README.md"),
	},
	{
		id: "governance-process",
		title: "Governance Process",
		subtitle: "How ideas become executed protocol decisions",
		content: readDoc("zReadMe/governance/governance-process/README.md"),
	},
	{
		id: "roles",
		title: "Roles and Permissions",
		subtitle: "Operational classes, approvals, and revocation",
		content: readDoc("zReadMe/governance/roles-and-permissions/README.md"),
	},
	{
		id: "emergency-protocols",
		title: "Emergency Protocols",
		subtitle: "Article VII operationalized",
		content: readDoc("zReadMe/governance/emergency-protocols/README.md"),
	},
	{
		id: "foundation-charter",
		title: "Foundation Charter",
		subtitle: "Legal and operational support framework",
		content: readDoc("zReadMe/governance/foundation-charter.md/README.md"),
	},
	{
		id: "smart-contract-roadmap",
		title: "Smart Contract Roadmap",
		subtitle: "Current contract and non-contract follow-ups",
		content: readDoc("zReadMe/smartContractToDo.md"),
	},
	{
		id: "proof-pack",
		title: "Proof Pack",
		subtitle: "Risk parameter evidence from deterministic simulations",
		content: readDoc("zReadMe/ProofPack.md"),
	},
	{
		id: "sim-runs",
		title: "Simulation Run Commands",
		subtitle: "Canonical simulator command reference",
		content: readDoc("zReadMe/.simRun.md"),
	},
];

export default function HomeMissionPage() {
	return (
		<main className={styles.page}>
			<section className={styles.hero}>
				<div className={styles.heroGlow} />
				<p className={styles.kicker}>Decentralized Commodity Settlement Network</p>

				<h1 className={styles.title}>
					When the banks fail,
					<span>the grain still needs to move.</span>
				</h1>

				<p className={styles.subtitle}>
					When the systems break — fuel, natural gas, wheat, livestock, copper, corn —
					the world doesn't stop. It just loses its coordination layer.
				</p>

				<p className={styles.subtext}>
					DCSN is that coordination layer. Open infrastructure for the movement of real commodities.
					Built to operate when the old rails don't.
				</p>

				<div className={styles.actions}>
					<a href="#docs" className={styles.primaryBtn}>Read the White Paper</a>
					<a href="/futures" className={styles.secondaryBtn}>Enter Markets</a>
				</div>
			</section>

			<section className={styles.principlesSection}>
				<h2>What moves us?</h2>
				<div className={styles.principleGrid}>
					{principles.map((item) => (
						<article key={item.title} className={styles.principleCard}>
							<h3>{item.title}</h3>
							<p>{item.body}</p>
						</article>
					))}
				</div>
			</section>

			<section className={styles.architectureSection}>
				<h2>System Architecture</h2>
				<div className={styles.archGrid}>
					{architecture.map((layer) => (
						<article key={layer.title} className={styles.archCard}>
							<h3>{layer.title}</h3>
							<p>{layer.text}</p>
						</article>
					))}
				</div>
			</section>

			<section id="docs" className={styles.docsSection}>
				<div className={styles.docsHeader}>
					<h2>Document Hub</h2>
					<p>
						Full source-aligned documentation in one place. Open any panel below to read the complete content.
					</p>
				</div>

				<div className={styles.docsList}>
					{docs.map((doc) => (
						<details key={doc.id} className={styles.docItem}>
							<summary>
								<div>
									<h3>{doc.title}</h3>
									<p>{doc.subtitle}</p>
								</div>
								<span className={styles.expandLabel}>Open</span>
							</summary>
							<div className={styles.docBody}>
								<pre>{doc.content}</pre>
							</div>
						</details>
					))}
				</div>
			</section>

			<section className={styles.ctaSection}>
				<h2>Come build with us.</h2>
				<p>
					Not because you have to. Because something in you whispers that this matters.
					A parallel rail. A backup plan. A chance to leave the world more resilient than you found it.
				</p>
				<div className={styles.actions}>
					<a href="/admin?auth=admin123" className={styles.primaryBtn}>Join the Network</a>
					<a href="#docs" className={styles.secondaryBtn}>Read the Specs</a>
				</div>
			</section>
		</main>
	);
}