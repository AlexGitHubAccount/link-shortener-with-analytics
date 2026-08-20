// Prisma v7 config: datasource URL configuration
// This tells Prisma where to find the DATABASE_URL env var

export default {
  datasources: {
    db: {
      url: process.env.DATABASE_URL || 'postgresql://user:password@localhost:5432/db',
    },
  },
};
