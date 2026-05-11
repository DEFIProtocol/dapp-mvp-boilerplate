import fs from "node:fs";
import path from "node:path";

type DeploymentFile = {
  addresses?: {
    perpEngine?: string;
    settlementEngine?: string;
  };
  initialConfig?: {
    collateralToken?: string;
  };
  settlementEngine?: string;
  usdc?: string;
};

export type ResolvedDeploymentConfig = {
  manifestPath: string;
  settlementAddress: string;
  usdcAddress: string;
};

function isAddress(value: unknown): value is string {
  return typeof value === "string" && /^0x[a-fA-F0-9]{40}$/.test(value);
}

function resolveManifestPath(): string {
  const networkKey = (process.env.CONTRACT_DEPLOYMENT_NETWORK ?? "baseSepolia").trim();
  const fileOrder = [
    `${networkKey}.json`,
    "baseSepolia.json",
    "hardhatMainnet.json",
    "localhost.json",
  ];

  const roots = [
    path.resolve(process.cwd(), "../contracts/deployments"),
    path.resolve(process.cwd(), "apps/contracts/deployments"),
    path.resolve(process.cwd(), "contracts/deployments"),
  ];

  const candidates: string[] = [];
  for (const root of roots) {
    for (const fileName of fileOrder) {
      const candidate = path.join(root, fileName);
      if (!candidates.includes(candidate)) {
        candidates.push(candidate);
      }
    }
  }

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(
    "Missing deployment manifest. Expected one of: baseSepolia.json, hardhatMainnet.json, localhost.json",
  );
}

export function loadDeploymentConfig(): ResolvedDeploymentConfig {
  const manifestPath = resolveManifestPath();
  const raw = fs.readFileSync(manifestPath, "utf8");
  const parsed = JSON.parse(raw) as DeploymentFile;

  const settlementAddress =
    parsed.addresses?.perpEngine ??
    parsed.addresses?.settlementEngine ??
    parsed.settlementEngine;

  const usdcAddress = parsed.initialConfig?.collateralToken ?? parsed.usdc;

  if (!isAddress(settlementAddress)) {
    throw new Error(
      `Invalid settlement address in deployment manifest: ${manifestPath}`,
    );
  }

  if (!isAddress(usdcAddress)) {
    throw new Error(
      `Invalid collateral token address in deployment manifest: ${manifestPath}`,
    );
  }

  return {
    manifestPath,
    settlementAddress,
    usdcAddress,
  };
}
