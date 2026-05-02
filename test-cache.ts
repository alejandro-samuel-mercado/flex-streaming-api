async function test() {
  const url = 'http://localhost:4000/api/content/cmooq9vpx000g2yo0zv0mgdmw';
  
  console.log("--- REQUEST 1 (MISS/BYPASS) ---");
  const res1 = await fetch(url);
  const data1 = await res1.json();
  console.log("Status:", res1.status);
  console.log("Response Keys:", Object.keys(data1));
  console.log("Success:", data1.success);
  console.log("Data exists:", !!data1.data);
  
  console.log("\n--- REQUEST 2 (HIT) ---");
  const res2 = await fetch(url);
  const data2 = await res2.json();
  console.log("Status:", res2.status);
  console.log("Cache Header:", res2.headers.get('X-Cache'));
  console.log("Response Keys:", Object.keys(data2));
  console.log("Success:", data2.success);
  console.log("Data exists:", !!data2.data);
}
test();
