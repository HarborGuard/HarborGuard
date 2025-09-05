const { PrismaClient } = require('../src/generated/prisma');
const prisma = new PrismaClient();

async function main() {
  const result = await prisma.$queryRaw`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    ORDER BY table_name
  `;
  
  console.log('\nDatabase tables:');
  console.log('================');
  result.forEach(row => {
    console.log('- ' + row.table_name);
  });
  
  // Check if policy tables exist
  const policyTables = result.filter(row => 
    row.table_name === 'policy_rules' || 
    row.table_name === 'policy_violations'
  );
  
  if (policyTables.length === 0) {
    console.log('\n✅ Policy tables successfully removed!');
  } else {
    console.log('\n⚠️ Warning: Policy tables still exist:', policyTables.map(t => t.table_name));
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());