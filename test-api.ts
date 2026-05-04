import { ContentService } from './src/modules/content/content.service';
async function main() {
  const result = await ContentService.getAllContent({ page: 1, limit: 50, featured: true, sort: 'recent', lang: 'es' });
  console.log(result.data.map(d => d.featured));
}
main();
