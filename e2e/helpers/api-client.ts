import { APIRequestContext, expect } from '@playwright/test';

/**
 * Exact authoritative roster of the 24 colleagues.
 */
export const CANONICAL_COLLEAGUES = [
  'Lada',
  'Sara',
  'Norman',
  'Norbert',
  'Thomas',
  'Marco',
  'Julia',
  'Kristoph',
  'Jana',
  'Saman',
  'Susana',
  'Ronny',
  'Lucas',
  'Carolin',
  'Marcel',
  'Tommy',
  'Joachim',
  'André',
  'Julian',
  'Eric',
  'Andreas',
  'Damjan',
  'Janek',
  'Patrick',
] as const;

export type ColleagueName = typeof CANONICAL_COLLEAGUES[number];

/**
 * Participant entity from /api/participants
 */
export interface Participant {
  id: number;
  name: string;
  displayName: string;
  isRegistered: boolean;
  registeredAt: string | null;
}

/**
 * System status from /api/status
 */
export interface SystemStatus {
  isDrawn: boolean;
  totalParticipants: number;
  registeredCount: number;
  drawnAt: string | null;
}

/**
 * Assignment pair for derangement verification
 */
export interface AssignmentPair {
  giverId: number;
  giverName?: string;
  receiverId: number;
  receiverName?: string;
}

/**
 * Mathematical Derangement & Hamiltonian Cycle Verification Engine.
 * Verifies all invariant properties:
 * 1. Count equals 24.
 * 2. Bijective mapping (every participant is giver exactly once and receiver exactly once).
 * 3. Fixpoint-free (no participant gives to themselves: giverId != receiverId).
 * 4. Single Hamiltonian cycle of length 24 (zero disjoint 2-cycles or isolated cliques).
 */
export function verifyDerangementProperties(
  assignments: AssignmentPair[],
  expectedCount = 24
): {
  isValid: boolean;
  errors: string[];
  isSingleCycle: boolean;
  cycleLength: number;
} {
  const errors: string[] = [];

  if (assignments.length !== expectedCount) {
    errors.push(`Expected ${expectedCount} assignments, got ${assignments.length}`);
  }

  const givers = new Set<number>();
  const receivers = new Set<number>();
  const giverToReceiver = new Map<number, number>();

  for (const pair of assignments) {
    // Check self-draw
    if (pair.giverId === pair.receiverId) {
      errors.push(`Self-draw detected for participant ID ${pair.giverId} (${pair.giverName})`);
    }

    // Check duplicate giver
    if (givers.has(pair.giverId)) {
      errors.push(`Duplicate giver ID ${pair.giverId}`);
    }
    givers.add(pair.giverId);

    // Check duplicate receiver
    if (receivers.has(pair.receiverId)) {
      errors.push(`Duplicate receiver ID ${pair.receiverId}`);
    }
    receivers.add(pair.receiverId);

    giverToReceiver.set(pair.giverId, pair.receiverId);
  }

  // Verify single Hamiltonian cycle
  let cycleLength = 0;
  let isSingleCycle = false;

  if (assignments.length > 0 && errors.length === 0) {
    const startId = assignments[0].giverId;
    let currentId = startId;
    const visited = new Set<number>();

    while (currentId !== undefined && !visited.has(currentId)) {
      visited.add(currentId);
      currentId = giverToReceiver.get(currentId)!;
      cycleLength++;
    }

    if (currentId === startId && cycleLength === expectedCount && visited.size === expectedCount) {
      isSingleCycle = true;
    } else {
      errors.push(
        `Permutation is NOT a single cycle: cycle closed at length ${cycleLength} out of ${expectedCount}`
      );
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    isSingleCycle,
    cycleLength,
  };
}

/**
 * Typed API Client for interacting with Wichteln backend endpoints.
 */
export class WichtelnApiClient {
  constructor(private request: APIRequestContext, private baseURL: string = '') {}

  async getStatus(): Promise<SystemStatus> {
    const res = await this.request.get(`${this.baseURL}/api/status`);
    expect(res.ok()).toBeTruthy();
    return (await res.json()) as SystemStatus;
  }

  async getParticipants(): Promise<Participant[]> {
    const res = await this.request.get(`${this.baseURL}/api/participants`);
    expect(res.ok()).toBeTruthy();
    return (await res.json()) as Participant[];
  }

  async getRegisterOptions(participantId: number): Promise<any> {
    const res = await this.request.post(`${this.baseURL}/api/auth/register-options`, {
      data: { participantId },
    });
    return { status: res.status(), body: await res.json() };
  }

  async verifyRegistration(participantId: number, response: any): Promise<any> {
    const res = await this.request.post(`${this.baseURL}/api/auth/register-verify`, {
      data: { participantId, response },
    });
    return {
      status: res.status(),
      body: await res.json(),
      headers: res.headers(),
    };
  }

  async getLoginOptions(participantId?: number): Promise<any> {
    const res = await this.request.post(`${this.baseURL}/api/auth/login-options`, {
      data: { participantId },
    });
    return { status: res.status(), body: await res.json() };
  }

  async verifyLogin(response: any): Promise<any> {
    const res = await this.request.post(`${this.baseURL}/api/auth/login-verify`, {
      data: { response },
    });
    return {
      status: res.status(),
      body: await res.json(),
      headers: res.headers(),
    };
  }

  async getMe(): Promise<any> {
    const res = await this.request.get(`${this.baseURL}/api/auth/me`);
    return { status: res.status(), body: await res.json() };
  }

  async getAssignment(): Promise<any> {
    const res = await this.request.get(`${this.baseURL}/api/me/assignment`);
    return { status: res.status(), body: await res.json() };
  }

  async getWishlist(): Promise<any> {
    const res = await this.request.get(`${this.baseURL}/api/me/wishlist`);
    return { status: res.status(), body: await res.json() };
  }

  async updateWishlist(content: string): Promise<any> {
    const res = await this.request.put(`${this.baseURL}/api/me/wishlist`, {
      data: { content },
    });
    return { status: res.status(), body: await res.json() };
  }

  async getPartnerWishlist(): Promise<any> {
    const res = await this.request.get(`${this.baseURL}/api/partner/wishlist`);
    return { status: res.status(), body: await res.json() };
  }

  async adminLogin(pin: string): Promise<any> {
    const res = await this.request.post(`${this.baseURL}/api/admin/login`, {
      data: { pin },
    });
    return { status: res.status(), body: await res.json(), headers: res.headers() };
  }

  async getAdminOverview(): Promise<any> {
    const res = await this.request.get(`${this.baseURL}/api/admin/overview`);
    return { status: res.status(), body: await res.json() };
  }

  async triggerAdminDraw(): Promise<any> {
    const res = await this.request.post(`${this.baseURL}/api/admin/draw`);
    return { status: res.status(), body: await res.json() };
  }
}
