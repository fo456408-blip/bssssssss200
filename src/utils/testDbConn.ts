import { PrismaClient } from '@prisma/client';

const hosts = ['localhost', '127.0.0.1', '::1'];

async function testConnections() {
  for (const host of hosts) {
    const url = `mysql://root@${host}:3306/engcode_db`;
    console.log(`Testing URL: ${url}`);
    const prisma = new PrismaClient({ datasources: { db: { url } } });
    try {
      await prisma.$connect();
      console.log(`SUCCESS! Connected with host="${host}" and no password!`);
      await prisma.$disconnect();
      return;
    } catch (err: any) {
      console.log(`Failed for host "${host}": ${err.message?.split('\n')[0]}`);
      await prisma.$disconnect();
    }
  }
}

testConnections();
