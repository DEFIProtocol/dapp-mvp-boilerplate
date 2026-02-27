export async function fetchHoldings(address: string, chainId = "1") {
  const url = `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/infura/holdings?address=${address}`;

  const res = await fetch(url, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
    cache: "no-store"
  });

  if (!res.ok) {
    throw new Error("Failed to fetch holdings");
  }

  return res.json();
}