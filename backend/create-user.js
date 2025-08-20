const readline = require('readline');
const bcrypt = require('bcryptjs');
const mysql = require('mysql2/promise');
require('dotenv').config();

// --- SCRIPT CONFIGURATION ---
const SALT_ROUNDS = 10; // Standard salt rounds for bcrypt

// --- DATABASE CONNECTION (reads from your .env file) ---
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
});

// --- INTERACTIVE PROMPT SETUP ---
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const createUser = async () => {
    console.log('--- Beta Suite User Creation Tool ---');

    const username = await new Promise(resolve => {
        rl.question('Enter username: ', resolve);
    });

    const password = await new Promise(resolve => {
        rl.question('Enter password: ', resolve);
    });

    if (!username || !password) {
        console.error('\n[ERROR] Username and password cannot be empty.');
        return;
    }

    try {
        console.log('\nHashing password...');
        const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

        console.log('Inserting new user into the database...');
        await pool.query(
            'INSERT INTO users (username, password_hash) VALUES (?, ?)',
            [username, hashedPassword]
        );

        console.log(`\n[SUCCESS] User "${username}" was created successfully!`);
        console.log('You can now log in with this user on the frontend.');

    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            console.error(`\n[ERROR] The username "${username}" already exists. Please choose another.`);
        } else {
            console.error('\n[ERROR] An unexpected error occurred:', error.message);
        }
    } finally {
        // Ensure the script always exits
        rl.close();
        pool.end();
    }
};

createUser();