/**
 * Shared types and DTOs for link-shortener application
 *
 * This package contains type definitions shared between frontend and backend.
 * DTO validation (class-validator for Nest, zod for React) will be added as features are implemented.
 */

// Placeholder type to verify workspace setup
export interface HealthStatus {
  status: 'up' | 'down';
  timestamp: string;
}

// Will be implemented in Stage 2 (Links CRUD)
export interface Link {
  id: string;
  originalUrl: string;
  shortCode: string;
  isCustomAlias: boolean;
  title?: string;
  isActive: boolean;
  expiresAt?: string;
  createdAt: string;
  updatedAt: string;
}

// Will be implemented in Stage 2 (Redirect tracking)
export interface Click {
  id: string;
  linkId: string;
  clickedAt: string;
  referrer?: string;
  browser?: string;
  os?: string;
  deviceType: 'DESKTOP' | 'MOBILE' | 'TABLET' | 'BOT' | 'UNKNOWN';
}

// Will be implemented in Stage 3 (Frontend forms)
export interface CreateLinkRequest {
  originalUrl: string;
  customCode?: string;
  title?: string;
}

// Will be implemented in Stage 5 (Analytics)
export interface LinkAnalytics {
  linkId: string;
  totalClicks: number;
  clicksByDay: Array<{
    date: string;
    count: number;
  }>;
  topReferrers: Array<{
    referrer: string;
    count: number;
  }>;
  deviceBreakdown: {
    desktop: number;
    mobile: number;
    tablet: number;
    bot: number;
    unknown: number;
  };
}
