import styles from "./page.module.css";
import DocListClient from "./DocListClient";

const principles = [
  {
    title: "Shelter from the storm",
    body:
      "When traditional systems fail and borders close, the food must still move. The fuel must still flow. ironRelay is the quiet, decentralized supply network beneath—ensuring global commodities never stop, even when infrastructure does."
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
		title: "Governance Layer",
		subtitle: "The Capture‑Resistant Judiciary & Legislative Network",
		text: `The Governance Layer forms a permanent, self‑governing digital republic designed to resist corporate or governmental capture and preserve ironRelay as a neutral public good.

The Congress (House of Representatives)
Composed of humans who pass the Competency Gate. Each holds a non‑transferable, identity‑bound ERC‑1155 token granting exactly one vote per human. Enforces absolute Sybil resistance, prevents whale/bot/cartel capture. No identity may hold more than 1% of total congressional voting power.

The Senate (Chamber of Contributors)
Composed of transferable ERC‑20 Contributor Tokens representing capital and development contributors. DAO treasury cannot sell these tokens—distributed only via retroactive public‑good grants to reward active protocol builders.

The Executive & Node Veto
Bills require approval from both chambers and a 7‑day timelock. Active node operators may issue a Physical Software Veto if 66% reject the bill client‑side, protecting real‑world infrastructure from unsafe code changes.

The Optimistic Oracle Court (Judicial Branch)
Fraud accusations undergo a 48‑hour Probable Cause Review by randomly drafted cryptographic jurors. If verified: toxic identities are permanently revoked, governance rights are burned, and malicious actors are slashed.`,
		diagram: "/diagrams/GovernanceStructure.jpg",
		alt: "Governance Structure Diagram"
	},
	{
		title: "Node Layer",
		subtitle: "The Real‑World Translation Layer: Asynchronous State Oracles & Franchise Nodes",
		text: `The Node Infrastructure Layer is the foundation that differentiates ironRelay from purely digital DeFi protocols, transforming open‑source servers and client apps into a decentralized delivery network.

Asynchronous State Oracles
Instead of consuming corporate API price feeds, franchise nodes evaluate, sign, and emit cryptographic proofs of real‑world physical states—crop processing milestones, warehouse inventories, transit completions, and more.

Zero‑Trust Multi‑Party Verification
Settlement cannot be triggered by a single party. Escrow release requires a multi‑party web of signatures combining GPS telemetry, IoT sensor logs, and manual operator verification to prevent physical‑digital decoupling.

Immutable Role Permissions
Anyone may spin up a franchise node, but executing real‑world operations requires DAO‑approved role credentials (Farmers, Transporters, Processors, Warehouses), each tied to verified operational standards.

Read‑Only Treasury Boundary
Node infrastructure is strictly isolated from treasury execution rights. Nodes post proofs that trigger smart‑contract events, but cannot directly debit protocol funds, eliminating rogue‑oracle drainage vectors.`,
		diagram: "/diagrams/RealWorldFlow.jpg",
		alt: "Real World Flow Diagram"
	},
	{
		title: "Smart Contract Layer",
		subtitle: "The Core Execution Engine: Isolated Financial Clearinghouse & Underwritten Asset Vaults",
		text: `The Smart Contract Layer functions as the hyper‑resilient, crypto‑settled clearinghouse of the ironRelay network, executing perpetual futures, options, and unified cross‑margin accounts without reliance on banks or centralized financial institutions.

EVM Modular Isolation
To comply with Ethereum/Base size constraints (EIP‑170) and minimize attack surface, the financial engines are decoupled into independent, interacting smart contracts (PerpetualsEngine.sol, OptionsMarket.sol).

Underwritten Capital & Cross‑Margin Pools
Options operate via an order‑book model requiring writers to lock substantial upfront collateral, avoiding the fragility of peer‑to‑pool systems during volatility.

Systemic Contagion Shields
A centralized Treasury.sol and InsuranceFund.sol framework governs solvency. Automated Auto‑Deleveraging (ADL) scripts force‑close toxic liabilities during extreme (e.g., 90% instant gap‑down) market events, preventing bad‑debt cascades.

Strict Asset Structuring
All physical commodities are represented via immutable data structs defining assetId, qualityGrade, and custodial ownership, binding physical reality directly to digital escrow.`,
		diagram: "/diagrams/SmartContract.jpg",
		alt: "Smart Contract Layer Diagram"
	},
];

// PDFs will be served from the web app `public/docs/` directory.
// Place files like `apps/web/public/docs/WhitePaper.pdf` and others there.

const docs = [
	{
		id: "whitepaper",
		title: "White Paper",
		subtitle: "Full protocol vision and design",
		url: "/docs/WhitePaper.pdf",
	},
	{
		id: "constitution",
		title: "DAO Constitution",
		subtitle: "Core governance authority and boundaries",
		url: "/docs/DAOConstitution.pdf",
	},
	{
		id: "foundation-charter",
		title: "Foundation Charter",
		subtitle: "Legal and operational support framework",
		url: "/docs/FoundationCharter.pdf",
	},
	{
		id: "executive-summary",
		title: "Executive Summary",
		subtitle: "Top-line protocol overview and direction",
		url: "/docs/ExecutiveSummary.pdf",
	},
];

export default function HomeMissionPage() {
	return (
		<main className={styles.page}>
			<section className={styles.hero}>
				<div className={styles.heroGlow} />
				<p className={styles.kicker}>ironRelay</p>

				<h1 className={styles.title}>
        When traditional systems fail and borders close, 
        <span> the food must still move. The fuel must still flow.</span>
      </h1>

      <p className={styles.subtitle}>
        Whether it is wheat, livestock, copper, or corn—the world doesn&apos;t stop. 
        ironRelay is the quiet, decentralized network beneath, ensuring vital 
        commodities keep moving even when our infrastructure breaks.
      </p>
			<p className={styles.subtext}>
				ironRelay is that coordination layer. Open infrastructure for the movement of real commodities.
				Built to operate when the old rails don&apos;t.
			</p>

			<div className={styles.actions}>
				<a href="#docs" className={styles.primaryBtn}>Read the White Paper</a>
				<a href="/futures" className={styles.secondaryBtn}>Enter Markets</a>
			</div>
			</section>

		<section className={styles.architectureSection}>
			<h2>System Architecture</h2>
			<div className={styles.archList}>
				{architecture.map((layer, index) => (
					<article key={layer.title} className={`${styles.archRow} ${index % 2 === 1 ? styles.reverse : ''}`}>
						<div className={styles.archContent}>
							<h3>{layer.title}</h3>
							{layer.subtitle && <h4 className={styles.archSubtitle}>{layer.subtitle}</h4>}
							<p className={styles.archText}>{layer.text}</p>
						</div>
						{layer.diagram && (
							<div className={styles.diagramContainer}>
								<img 
									src={layer.diagram} 
									alt={layer.alt} 
									className={styles.diagram}
								/>
							</div>
						)}
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
					<DocListClient docs={docs} />
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