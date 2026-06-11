import styles from "./page.module.css";
import DocListClient from "./DocListClient";

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
				<p className={styles.kicker}>Decentralized Commodity Settlement Network</p>

				<h1 className={styles.title}>
					When the banks fail,
					<span>the grain still needs to move.</span>
				</h1>

				<p className={styles.subtitle}>
					When the systems break — fuel, natural gas, wheat, livestock, copper, corn —
				the world doesn&apos;t stop. It just loses its coordination layer.
			</p>

			<p className={styles.subtext}>
				DCSN is that coordination layer. Open infrastructure for the movement of real commodities.
				Built to operate when the old rails don&apos;t.
			</p>

			<div className={styles.actions}>
				<a href="#docs" className={styles.primaryBtn}>Read the White Paper</a>
				<a href="/futures" className={styles.secondaryBtn}>Enter Markets</a>
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