// hash_password.js
const bcrypt = require('bcryptjs');
const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

console.log("--- Password Hash Generator ---");
rl.question('Enter the new password for your admin account: ', (password) => {
    if (!password) {
        console.error("\nPassword cannot be empty.");
        rl.close();
        return;
    }

    const salt = bcrypt.genSaltSync(10);
    const hash = bcrypt.hashSync(password, salt);

    console.log("\n✅ Password Hashing Complete!");
    console.log("------------------------------------------------------------");
    console.log("Your secure password hash is:");
    console.log(hash);
    console.log("------------------------------------------------------------");
    console.log("Copy the entire hash string (starting with $2a...) and use it in the SQL query.");
    
    rl.close();
});