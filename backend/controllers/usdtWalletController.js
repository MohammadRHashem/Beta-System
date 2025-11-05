const pool = require('../config/db');

// GET all wallets for the logged-in user
exports.getAllWallets = async (req, res) => {
    const userId = req.user.id;
    try {
        const [wallets] = await pool.query(
            'SELECT id, wallet_name, wallet_address, is_enabled FROM usdt_wallets WHERE user_id = ? ORDER BY wallet_name ASC',
            [userId]
        );
        res.json(wallets);
    } catch (error) {
        console.error('[ERROR] Failed to fetch USDT wallets:', error);
        res.status(500).json({ message: 'Failed to fetch wallets.' });
    }
};

// POST a new wallet
exports.createWallet = async (req, res) => {
    const userId = req.user.id;
    const { wallet_name, wallet_address } = req.body;
    if (!wallet_name || !wallet_address) {
        return res.status(400).json({ message: 'Wallet name and address are required.' });
    }
    // Basic validation for TRON address format
    if (!/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(wallet_address)) {
        return res.status(400).json({ message: 'Invalid TRON wallet address format.' });
    }

    try {
        const [result] = await pool.query(
            'INSERT INTO usdt_wallets (user_id, wallet_name, wallet_address) VALUES (?, ?, ?)',
            [userId, wallet_name, wallet_address]
        );
        res.status(201).json({ id: result.insertId, wallet_name, wallet_address, is_enabled: 1 });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ message: 'This wallet address already exists.' });
        }
        console.error('[ERROR] Failed to create USDT wallet:', error);
        res.status(500).json({ message: 'Failed to create wallet.' });
    }
};

// PUT (update) an existing wallet's name
exports.updateWallet = async (req, res) => {
    const userId = req.user.id;
    const { id } = req.params;
    const { wallet_name } = req.body;
    if (!wallet_name) {
        return res.status(400).json({ message: 'Wallet name is required.' });
    }
    try {
        const [result] = await pool.query(
            'UPDATE usdt_wallets SET wallet_name = ? WHERE id = ? AND user_id = ?',
            [wallet_name, id, userId]
        );
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Wallet not found or permission denied.' });
        }
        res.json({ message: 'Wallet updated successfully.' });
    } catch (error) {
        console.error('[ERROR] Failed to update USDT wallet:', error);
        res.status(500).json({ message: 'Failed to update wallet.' });
    }
};

// DELETE a wallet
exports.deleteWallet = async (req, res) => {
    const userId = req.user.id;
    const { id } = req.params;
    try {
        const [result] = await pool.query(
            'DELETE FROM usdt_wallets WHERE id = ? AND user_id = ?',
            [id, userId]
        );
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Wallet not found or permission denied.' });
        }
        res.status(204).send();
    } catch (error) {
        console.error('[ERROR] Failed to delete USDT wallet:', error);
        res.status(500).json({ message: 'Failed to delete wallet.' });
    }
};

// PATCH to toggle the is_enabled status of a wallet
exports.toggleWallet = async (req, res) => {
    const userId = req.user.id;
    const { id } = req.params;
    const { is_enabled } = req.body;

    if (typeof is_enabled !== 'boolean') {
        return res.status(400).json({ message: 'A boolean `is_enabled` value is required.' });
    }

    try {
        const [result] = await pool.query(
            'UPDATE usdt_wallets SET is_enabled = ? WHERE id = ? AND user_id = ?',
            [is_enabled, id, userId]
        );
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Wallet not found or permission denied.' });
        }
        res.json({ message: `Wallet successfully ${is_enabled ? 'enabled' : 'disabled'}.` });
    } catch (error) {
        console.error('[ERROR] Failed to toggle USDT wallet:', error);
        res.status(500).json({ message: 'Failed to update wallet status.' });
    }
};