const fs = require('fs');
const file = 'src/modules/end-users/end-users.service.ts';
let code = fs.readFileSync(file, 'utf8');

code = code.replace(
    /static async togglePause\(accountId: string, userId: string, userRole: UserRole\) \{\s+const account = await prisma\.endUserAccount\.findUnique\(\{ where: \{ id: accountId \} \}\);\s+if \(!account \|\| account\.deletedAt\) \{\s+throw new AppError\(404, 'End user account not found', 'NOT_FOUND'\);\s+\}/,
    `static async togglePause(accountId: string, userId: string, userRole: UserRole) {
    const account = await prisma.endUserAccount.findUnique({ where: { id: accountId } });
    if (!account) {
      throw new AppError(404, 'End user account not found', 'NOT_FOUND');
    }

    if (account.deletedAt) {
      await prisma.endUserAccount.update({ where: { id: accountId }, data: { deletedAt: null } });
      account.deletedAt = null;
    }`
);

fs.writeFileSync(file, code);
