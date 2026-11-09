"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import {
  getPatients,
  getTreatments,
  getInjections,
  getHistory,
  getUsersFromDb,
  createPatientInDb,
  updatePatientInDb,
  deletePatientFromDb,
  createTreatmentInDb,
  DbUserRecord,
} from "@/lib/dataService";
import {
  PatientRecord,
  TreatmentRecord,
  InjectionItem,
  HistoryRecord,
  INITIAL_INJECTIONS,
} from "@/data/mockData";
import { isSupabaseConfigured } from "@/lib/supabase";

/**
 * Hook to fetch all patients with TanStack React Query caching.
 */
export function usePatientsQuery(isLive = true) {
  return useQuery<PatientRecord[]>({
    queryKey: queryKeys.patients.all,
    queryFn: () => getPatients(isLive),
    enabled: isLive,
    staleTime: 5 * 60 * 1000, // Fresh for 5 minutes
    gcTime: 30 * 60 * 1000,
  });
}

/**
 * Hook to fetch all treatments with caching.
 */
export function useTreatmentsQuery(isLive = true) {
  return useQuery<TreatmentRecord[]>({
    queryKey: queryKeys.treatments.all,
    queryFn: () => getTreatments(isLive),
    enabled: isLive,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

/**
 * Hook to fetch injections catalog with caching and initial fallback.
 */
export function useInjectionsQuery(isLive = true) {
  return useQuery<InjectionItem[]>({
    queryKey: queryKeys.injections.all,
    queryFn: () => getInjections(isLive),
    staleTime: 10 * 60 * 1000, // Catalog changes infrequently
    gcTime: 60 * 60 * 1000,
    initialData: INITIAL_INJECTIONS,
  });
}

/**
 * Hook to fetch import/export audit logs with caching.
 */
export function useHistoryQuery(isLive = true) {
  return useQuery<HistoryRecord[]>({
    queryKey: queryKeys.history.all,
    queryFn: () => getHistory(isLive),
    enabled: isLive,
    staleTime: 2 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });
}

/**
 * Hook to fetch database users with caching.
 */
export function useUsersQuery(isLive = true) {
  return useQuery<DbUserRecord[]>({
    queryKey: queryKeys.users.all,
    queryFn: () => getUsersFromDb(isLive),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

/**
 * Mutation hook for patient enrollment with optimistic/direct cache update.
 */
export function useCreatePatientMutation(isLive = true) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (newPatient: PatientRecord) =>
      createPatientInDb(newPatient, isLive),
    onSuccess: (res, variables) => {
      const record = res.data || variables;
      queryClient.setQueryData<PatientRecord[]>(
        queryKeys.patients.all,
        (old = []) => [
          record,
          ...old.filter((p) => p.patient_id !== record.patient_id),
        ]
      );
    },
  });
}

/**
 * Mutation hook for updating patient records with targeted cache update.
 */
export function useUpdatePatientMutation(isLive = true) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (updatedPatient: PatientRecord) =>
      updatePatientInDb(updatedPatient, isLive),
    onSuccess: (res, variables) => {
      const record = res.data || variables;
      queryClient.setQueryData<PatientRecord[]>(
        queryKeys.patients.all,
        (old = []) =>
          old.map((p) => (p.patient_id === record.patient_id ? record : p))
      );
    },
  });
}

/**
 * Mutation hook for patient deletion with targeted cache update.
 */
export function useDeletePatientMutation(isLive = true) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (patientId: number) => deletePatientFromDb(patientId, isLive),
    onSuccess: (res, patientId) => {
      if (res.success) {
        queryClient.setQueryData<PatientRecord[]>(
          queryKeys.patients.all,
          (old = []) => old.filter((p) => p.patient_id !== patientId)
        );
      }
    },
  });
}

/**
 * Mutation hook for adding treatments with targeted cache update.
 */
export function useCreateTreatmentMutation(isLive = true) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (newTreatment: TreatmentRecord) =>
      createTreatmentInDb(newTreatment, isLive),
    onSuccess: (res, variables) => {
      const record = res.data || variables;
      queryClient.setQueryData<TreatmentRecord[]>(
        queryKeys.treatments.all,
        (old = []) => [
          record,
          ...old.filter((t) => t.id !== record.id),
        ]
      );
    },
  });
}
