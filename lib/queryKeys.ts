/**
 * Centralized React Query Keys Factory
 * Provides consistent, type-safe query keys across the entire application.
 */

export const queryKeys = {
  patients: {
    all: ["patients"] as const,
    lists: () => [...queryKeys.patients.all, "list"] as const,
    list: (filters: Record<string, any>) => [...queryKeys.patients.lists(), filters] as const,
    details: () => [...queryKeys.patients.all, "detail"] as const,
    detail: (id: number | null | undefined) => [...queryKeys.patients.details(), id] as const,
  },
  treatments: {
    all: ["treatments"] as const,
    lists: () => [...queryKeys.treatments.all, "list"] as const,
    byPatient: (patientId: number | null | undefined) =>
      [...queryKeys.treatments.all, "patient", patientId] as const,
  },
  injections: {
    all: ["injections"] as const,
  },
  history: {
    all: ["history"] as const,
  },
  users: {
    all: ["users"] as const,
  },
} as const;

