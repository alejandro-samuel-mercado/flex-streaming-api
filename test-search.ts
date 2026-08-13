import 'dotenv/config';
import { prisma } from './src/shared/config/prisma';

async function testSearch(search: string) {
    const cleanSearchWords = search.replace(/[.,:;!?]/g, ' ').trim().split(/\s+/).filter(w => w.length > 0);
    const searchConditions = cleanSearchWords.map(word => {
        const wordWithoutAccents = word.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const generateAccentVariations = (word: string): string[] => {
            const charMap: Record<string, string[]> = {
                'a': ['a', 'á'], 'e': ['e', 'é'], 'i': ['i', 'í'], 'o': ['o', 'ó'], 'u': ['u', 'ú'], 'n': ['n', 'ñ'],
                'A': ['A', 'Á'], 'E': ['E', 'É'], 'I': ['I', 'Í'], 'O': ['O', 'Ó'], 'U': ['U', 'Ú'], 'N': ['N', 'Ñ']
            };
            let variations = [''];
            for (const char of word) {
                const mapped = charMap[char.toLowerCase()];
                if (mapped) {
                    const newVars: string[] = [];
                    for (const v of variations) {
                        newVars.push(v + char);
                        newVars.push(v + (char === char.toLowerCase() ? mapped[1] : mapped[1].toUpperCase()));
                    }
                    variations = newVars;
                } else {
                    for (let i = 0; i < variations.length; i++) {
                        variations[i] += char;
                    }
                }
            }
            return Array.from(new Set(variations));
        };
        const allVariations = generateAccentVariations(wordWithoutAccents);
        const orConditions = allVariations.map(variation => ({
            translations: { some: { title: { contains: variation, mode: 'insensitive' } } }
        }));
        return { OR: orConditions };
    });

    const where = { AND: searchConditions } as any;
    const count = await prisma.content.count({ where });
    console.log(`Buscando: "${search}" -> Resultados: ${count}`);
}

async function run() {
    await testSearch("nunca juegues con extraños");
}
run().finally(() => process.exit(0));
