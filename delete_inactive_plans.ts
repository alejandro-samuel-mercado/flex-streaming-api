import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const plans = await prisma.subscriptionPlan.findMany({
        where: { isActive: false }
    });
    
    console.log(`Found ${plans.length} inactive plans.`);

    for (const plan of plans) {
        const accounts = await prisma.endUserAccount.count({ where: { planId: plan.id } });
        const histories = await prisma.endUserPlanHistory.count({ where: { planId: plan.id } });
        
        console.log(`Plan: ${plan.name} (id: ${plan.id}) - Accounts: ${accounts}, Histories: ${histories}`);
        
        if (accounts === 0 && histories === 0) {
            console.log(`Deleting plan ${plan.name}...`);
            await prisma.subscriptionPlan.delete({ where: { id: plan.id } });
            console.log(`Deleted plan ${plan.name}.`);
        } else {
            console.log(`Cannot delete plan ${plan.name} because it has associated accounts or history.`);
        }
    }
}

main().catch(console.error).finally(() => prisma.$disconnect());
