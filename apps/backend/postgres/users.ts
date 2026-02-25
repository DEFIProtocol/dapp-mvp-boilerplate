
import { Pool } from "pg";

export interface UserRow {
	id?: string;
	wallet_address: string;
	email?: string;
	username?: string;
	chain_addresses?: any;
	watchlist?: any;
	is_verified_by_coinbase?: boolean;
	created_at?: string;
	updated_at?: string;
}

export function mapUserRow(row: any): UserRow | null {
	if (!row) return null;
	return {
		id: row.id,
		wallet_address: row.wallet_address,
		email: row.email,
		username: row.username,
		chain_addresses: row.chain_addresses,
		watchlist: row.watchlist,
		is_verified_by_coinbase: row.is_verified_by_coinbase,
		created_at: row.created_at,
		updated_at: row.updated_at
	};
}

export async function getAllUsers(pool: Pool): Promise<UserRow[]> {
	const result = await pool.query("SELECT * FROM users ORDER BY created_at DESC");
	return result.rows.map(mapUserRow).filter(Boolean);
}

export async function getUserById(pool: Pool, id: string): Promise<UserRow | null> {
	const result = await pool.query("SELECT * FROM users WHERE id = $1", [id]);
	return mapUserRow(result.rows[0]);
}

export async function getUserByWallet(pool: Pool, address: string): Promise<UserRow | null> {
	const result = await pool.query("SELECT * FROM users WHERE wallet_address = $1", [address]);
	return mapUserRow(result.rows[0]);
}

export async function createUser(pool: Pool, data: Partial<UserRow>): Promise<UserRow | null> {
	const { wallet_address, email, username } = data;
	if (!wallet_address) return null;
	const result = await pool.query(
		"INSERT INTO users (wallet_address, email, username) VALUES ($1, $2, $3) RETURNING *",
		[wallet_address, email, username]
	);
	return mapUserRow(result.rows[0]);
}

export async function updateUser(pool: Pool, id: string, data: Partial<UserRow>): Promise<UserRow | null> {
	const { email, username } = data;
	const result = await pool.query(
		"UPDATE users SET email = $1, username = $2 WHERE id = $3 RETURNING *",
		[email, username, id]
	);
	return mapUserRow(result.rows[0]);
}

export async function deleteUser(pool: Pool, id: string): Promise<UserRow | null> {
	const result = await pool.query(
		"DELETE FROM users WHERE id = $1 RETURNING *",
		[id]
	);
	return mapUserRow(result.rows[0]);
}
