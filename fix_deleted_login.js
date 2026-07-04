const fs = require('fs');

// Fix auth.service.ts (login)
const authServicePath = 'src/modules/auth/auth.service.ts';
let authServiceCode = fs.readFileSync(authServicePath, 'utf8');

authServiceCode = authServiceCode.replace(
    /const endUser = await prisma\.endUserAccount\.findUnique\(\{\s+where: \{ username: input\.username \},\s+include: \{ user: true \},\s+\}\);/,
    `const endUser = await prisma.endUserAccount.findUnique({
      where: { username: input.username },
      include: { user: true },
    });

    if (endUser && endUser.deletedAt) {
      throw new AppError(401, 'Account has been deleted', 'INVALID_CREDENTIALS');
    }`
);

fs.writeFileSync(authServicePath, authServiceCode);

// Fix auth.router.ts (auth/me)
const authRouterPath = 'src/modules/auth/auth.router.ts';
let authRouterCode = fs.readFileSync(authRouterPath, 'utf8');

authRouterCode = authRouterCode.replace(
    /if \(!account\) return next\(new Error\('Account not found'\)\);/,
    `if (!account || account.deletedAt) return res.status(401).json({ success: false, error: 'Account has been deleted', code: 'UNAUTHORIZED' });`
);

fs.writeFileSync(authRouterPath, authRouterCode);
