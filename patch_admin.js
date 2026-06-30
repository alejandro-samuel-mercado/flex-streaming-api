const fs = require('fs');
const file = 'src/modules/admin/admin.router.ts';
let code = fs.readFileSync(file, 'utf8');

code = code.replace(
    /if \(search\) \{\s+endUserWhere\.OR = \[\s+\{ username: \{ contains: search, mode: 'insensitive' \} \},\s+\{ managedBy: \{ username: \{ contains: search, mode: 'insensitive' \} \} \},\s+\{ managedBy: \{ name: \{ contains: search, mode: 'insensitive' \} \} \}\s+\];\s+\}/,
    `if (search) {
                endUserWhere.OR = [
                    { username: { contains: search, mode: 'insensitive' } },
                    { managedBy: { username: { contains: search, mode: 'insensitive' } } },
                    { managedBy: { name: { contains: search, mode: 'insensitive' } } }
                ];
                delete endUserWhere.deletedAt; // Permitir encontrar eliminados al buscar
            }`
);

fs.writeFileSync(file, code);
