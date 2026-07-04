import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
dotenv.config();
const prisma = new PrismaClient();
async function main() {
    const user = await prisma.endUserAccount.findUnique({
        where: { username: "luis177" }
    });
    console.log(JSON.stringify(user, null, 2));
}
main().catch(console.error);
