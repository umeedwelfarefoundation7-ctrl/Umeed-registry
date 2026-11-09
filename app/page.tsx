"use client";
import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Modal,
  btnSecondary,
  btnDanger,
  useToast,
  Badge,
  OfflineBanner,
  BulkUploadModal,
} from "@/components/ui";
import { useNav } from "@/context/providers";
import {
  PatientRecord,
  TreatmentRecord,
  InjectionItem,
  HistoryRecord,
} from "@/data/mockData";
import { checkSupabaseConnection, isSupabaseConfigured } from "@/lib/supabase";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import {
  usePatientsQuery,
  useTreatmentsQuery,
  useInjectionsQuery,
  useHistoryQuery,
  useCreatePatientMutation,
  useUpdatePatientMutation,
  useDeletePatientMutation,
  useCreateTreatmentMutation,
} from "@/lib/hooks/useRegistryData";
import {
  Database,
  RefreshCw,
  UserPlus,
  Upload,
} from "lucide-react";

// Feature Modules
import DashboardModule from "@/components/modules/dashboard/DashboardModule";
import PatientList from "@/components/modules/patients/PatientList";
import PatientForm from "@/components/modules/patients/PatientForm";
import PatientDetails from "@/components/modules/patients/PatientDetails";
import TreatmentForm from "@/components/modules/treatments/TreatmentForm";
import TreatmentTable from "@/components/modules/treatments/TreatmentTable";
import SettingsModule from "@/components/modules/settings/SettingsModule";

const SETTINGS_VIEWS = [
  "settings",
  "import",
  "export",
  "history",
  "injections",
  "typography",
  "roles",
  "security",
];

export default function AppHome() {
  const { activeView, setActiveView, selectedPatientId, setSelectedPatientId } = useNav();
  const { addToast } = useToast();
  const queryClient = useQueryClient();

  // Connection & Initial State (verified once on mount)
  const [isLiveDb, setIsLiveDb] = useState(isSupabaseConfigured);
  const [showEmptyUploadModal, setShowEmptyUploadModal] = useState(false);
  const [editingPatient, setEditingPatient] = useState<PatientRecord | null>(null);

  useEffect(() => {
    let mounted = true;
    checkSupabaseConnection().then((connected) => {
      if (mounted) setIsLiveDb(connected);
    });
    return () => {
      mounted = false;
    };
  }, []);

  // ── TanStack React Query: Centralized, Cached State ──
  const {
    data: patients = [],
    isLoading: patientsLoading,
    isFetching: patientsFetching,
    refetch: refetchPatients,
  } = usePatientsQuery(isLiveDb);

  const {
    data: treatments = [],
    isLoading: treatmentsLoading,
    isFetching: treatmentsFetching,
    refetch: refetchTreatments,
  } = useTreatmentsQuery(isLiveDb);

  const {
    data: injections = [],
    refetch: refetchInjections,
  } = useInjectionsQuery(isLiveDb);

  const {
    data: history = [],
    refetch: refetchHistory,
  } = useHistoryQuery(isLiveDb);

  // ── Mutations ──
  const createPatientMutation = useCreatePatientMutation(isLiveDb);
  const updatePatientMutation = useUpdatePatientMutation(isLiveDb);
  const deletePatientMutation = useDeletePatientMutation(isLiveDb);
  const createTreatmentMutation = useCreateTreatmentMutation(isLiveDb);

  const dataLoading = patientsLoading || treatmentsLoading;
  const isRefreshing = patientsFetching || treatmentsFetching;

  // Manual Refresh Handler
  const handleManualRefresh = useCallback(async () => {
    await Promise.all([
      refetchPatients(),
      refetchTreatments(),
      refetchInjections(),
      refetchHistory(),
    ]);
  }, [refetchPatients, refetchTreatments, refetchInjections, refetchHistory]);

  // Backward-compatible setters updating TanStack Query cache directly
  const setPatients = useCallback(
    (updater: PatientRecord[] | ((prev: PatientRecord[]) => PatientRecord[])) => {
      queryClient.setQueryData<PatientRecord[]>(queryKeys.patients.all, (old = []) =>
        typeof updater === "function" ? updater(old) : updater
      );
    },
    [queryClient]
  );

  const setTreatments = useCallback(
    (updater: TreatmentRecord[] | ((prev: TreatmentRecord[]) => TreatmentRecord[])) => {
      queryClient.setQueryData<TreatmentRecord[]>(queryKeys.treatments.all, (old = []) =>
        typeof updater === "function" ? updater(old) : updater
      );
    },
    [queryClient]
  );

  const setInjections = useCallback(
    (updater: InjectionItem[] | ((prev: InjectionItem[]) => InjectionItem[])) => {
      queryClient.setQueryData<InjectionItem[]>(queryKeys.injections.all, (old = []) =>
        typeof updater === "function" ? updater(old) : updater
      );
    },
    [queryClient]
  );

  const setHistory = useCallback(
    (updater: HistoryRecord[] | ((prev: HistoryRecord[]) => HistoryRecord[])) => {
      queryClient.setQueryData<HistoryRecord[]>(queryKeys.history.all, (old = []) =>
        typeof updater === "function" ? updater(old) : updater
      );
    },
    [queryClient]
  );

  // Patient Management Search & Filters
  const [patientSearch, setPatientSearch] = useState("");
  const [filterDiag, setFilterDiag] = useState("all");
  const [filterSev, setFilterSev] = useState("all");
  const [filterProv, setFilterProv] = useState("all");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [deleteCandidate, setDeleteCandidate] = useState<PatientRecord | null>(null);

  // Filtered Patients List (Memoized to prevent unnecessary re-computations)
  const filteredPatients = useMemo(() => {
    return patients.filter((p) => {
      if (filterDiag !== "all" && p.diagnosis !== filterDiag) return false;
      if (filterSev !== "all" && p.severity !== filterSev) return false;
      if (filterProv !== "all" && p.province !== filterProv) return false;
      if (!patientSearch.trim()) return true;
      const q = patientSearch.toLowerCase();
      return (
        p.patient_name.toLowerCase().includes(q) ||
        p.registration_no.toLowerCase().includes(q) ||
        (p.cnic && p.cnic.includes(q)) ||
        (p.telephone && p.telephone.includes(q)) ||
        (p.city && p.city.toLowerCase().includes(q))
      );
    });
  }, [patients, filterDiag, filterSev, filterProv, patientSearch]);

  // Selected Patient for Details
  const activePatient =
    patients.find((p) => p.patient_id === selectedPatientId) || patients[0];

  // Bulk Delete
  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    try {
      for (const id of selectedIds) {
        await deletePatientMutation.mutateAsync(id);
      }
      addToast(
        "info",
        "Bulk Deletion",
        `Removed ${selectedIds.length} selected patient records.`
      );
    } catch (err: any) {
      addToast("error", "Bulk Deletion Error", err?.message || "Could not delete records.");
    }
    setSelectedIds([]);
  };

  // Handle Patient Record Update
  const handlePatientUpdated = async (updatedP: PatientRecord) => {
    try {
      const res = await updatePatientMutation.mutateAsync(updatedP);
      if (res.success && res.data) {
        addToast(
          "success",
          "Patient Profile Updated",
          `${res.data.registration_no} - ${res.data.patient_name} changes saved to database.`
        );
      } else {
        if (res.error) {
          addToast(
            "error",
            "Database Notice",
            `Saved locally. Cloud sync notice: ${res.error}`
          );
        }
      }
      setEditingPatient(null);
      return res;
    } catch (err: any) {
      addToast("error", "Update Failed", err?.message || "Could not update patient.");
      setEditingPatient(null);
      return { success: false, error: err?.message };
    }
  };

  const handleStartEdit = (p: PatientRecord) => {
    setEditingPatient(p);
    setSelectedPatientId(p.patient_id);
    setActiveView("patients_edit");
  };

  // Single Delete Confirmation
  const confirmDeleteSingle = async () => {
    if (!deleteCandidate) return;
    try {
      const res = await deletePatientMutation.mutateAsync(deleteCandidate.patient_id);
      if (res.success) {
        addToast(
          "info",
          "Record Deleted",
          `Patient ${deleteCandidate.registration_no} removed from registry.`
        );
      } else {
        addToast(
          "error",
          "Delete Failed",
          res.error || "Could not delete from database."
        );
      }
    } catch (err: any) {
      addToast("error", "Delete Failed", err?.message || "Could not delete from database.");
    }
    setDeleteCandidate(null);
  };

  // Handle New Patient Enrollment
  const handlePatientCreated = async (newP: PatientRecord) => {
    try {
      const res = await createPatientMutation.mutateAsync(newP);
      if (res.success && res.data) {
        setSelectedPatientId(res.data.patient_id);
        addToast(
          "success",
          "Patient Registered Successfully",
          `${res.data.registration_no} - ${res.data.patient_name} enrolled in database.`
        );
      } else {
        if (res.error) {
          addToast(
            "error",
            "Database Notice",
            `Saved locally. Cloud sync notice: ${res.error}`
          );
        }
      }
      return res;
    } catch (err: any) {
      addToast("error", "Enrollment Failed", err?.message || "Could not register patient.");
      return { success: false, error: err?.message };
    }
  };

  // Handle New Treatment Infusion
  const handleTreatmentAdded = async (newT: TreatmentRecord) => {
    try {
      const res = await createTreatmentMutation.mutateAsync(newT);
      if (res.success && res.data) {
        addToast("success", "Treatment Recorded", `Infusion successfully saved to database.`);
      }
    } catch (err: any) {
      console.error("Treatment log error:", err);
    }
  };

  return (
    <div className="space-y-6">
      {/* ── OFFLINE STATUS & SYNC QUEUE BANNER ── */}
      <OfflineBanner isLiveDb={isLiveDb} onSyncComplete={handleManualRefresh} />

      {/* ── LIVE DATABASE STATUS BANNER ── */}
      <div className="neu-card p-3 sm:px-4 sm:py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs border border-white/60 dark:border-[#3d1c43]/60">
        <div className="flex items-center gap-2.5">
          <div
            className={`w-2.5 h-2.5 rounded-full ${
              isLiveDb ? "bg-emerald-500 animate-pulse" : "bg-sky-500"
            }`}
          />
          <div className="flex items-center gap-1.5 font-semibold text-[#3A0F34] dark:text-[#f6f1f7]">
            <Database size={14} className={isLiveDb ? "text-emerald-500" : "text-sky-500"} />
            <span>
              {isLiveDb ? "Live Supabase Database Connected" : "Clinical Registry Online"}
            </span>
          </div>
          <Badge variant={isLiveDb ? "success" : "neutral"} size="sm">
            {isLiveDb ? "Cloud Sync Active" : "Local Sync"}
          </Badge>
        </div>

        <div className="flex items-center gap-2.5">
          <span className="text-[11px] text-slate-500 dark:text-slate-400">
            {patients.length} Registered Patients · {treatments.length} Factor Infusions
          </span>

          <button
            onClick={handleManualRefresh}
            title="Refresh registry data"
            disabled={isRefreshing}
            className="neu-btn p-1.5 rounded-xl hover:text-[#EAAA00] transition-transform cursor-pointer disabled:opacity-50"
          >
            <RefreshCw size={13} className={isRefreshing ? "animate-spin text-[#EAAA00]" : ""} />
          </button>
        </div>
      </div>

      {/* ── EMPTY STATE FOR NEW REGISTRY (0 PATIENTS) ── */}
      {patients.length === 0 && !dataLoading && activeView === "patients" && (
        <div className="neu-card p-10 text-center space-y-4 border border-dashed border-[#EAAA00]/40">
          <div className="w-14 h-14 rounded-2xl neu-inset mx-auto flex items-center justify-center text-[#EAAA00]">
            <UserPlus size={26} />
          </div>
          <div>
            <h3 className="text-base font-bold text-[#3A0F34] dark:text-[#f6f1f7]">
              No Patients Enrolled Yet
            </h3>
            <p className="text-xs text-slate-500 dark:text-[#bdaec2] max-w-md mx-auto mt-1">
              Your clinical registry database is active. Register your first patient or bulk upload existing patient records from Excel or CSV.
            </p>
          </div>
          <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={() => setActiveView("patients_new")}
              className="neu-btn bg-[#EAAA00] text-[#190617] font-bold px-4 py-2.5 rounded-xl text-xs hover:bg-[#d49a00] cursor-pointer inline-flex items-center gap-1.5"
            >
              <UserPlus size={14} />
              <span>Register First Patient</span>
            </button>
            <button
              onClick={() => setShowEmptyUploadModal(true)}
              className={`${btnSecondary} flex items-center gap-1.5`}
            >
              <Upload size={14} className="text-[#EAAA00]" />
              <span>Bulk Upload Patients (Excel / CSV)</span>
            </button>
          </div>
        </div>
      )}

      {/* 1. DASHBOARD */}
      {activeView === "dashboard" && (
        <DashboardModule
          patients={patients}
          treatments={treatments}
          history={history}
        />
      )}

      {/* 2. PATIENTS / USERS LIST */}
      {activeView === "patients" && patients.length > 0 && (
        <PatientList
          patients={patients}
          filteredPatients={filteredPatients}
          patientSearch={patientSearch}
          setPatientSearch={setPatientSearch}
          filterDiag={filterDiag}
          setFilterDiag={setFilterDiag}
          filterSev={filterSev}
          setFilterSev={setFilterSev}
          filterProv={filterProv}
          setFilterProv={setFilterProv}
          selectedIds={selectedIds}
          setSelectedIds={setSelectedIds}
          onBulkDelete={handleBulkDelete}
          onSelectDeleteCandidate={setDeleteCandidate}
          onEditPatient={handleStartEdit}
          isLiveDb={isLiveDb}
          onPatientsImported={(newP) => {
            setPatients((prev) => [...newP, ...prev]);
          }}
        />
      )}

      {/* 3. REGISTER NEW PATIENT */}
      {activeView === "patients_new" && (
        <PatientForm
          onSuccess={handlePatientCreated}
          isLiveDb={isLiveDb}
          patients={patients}
          onPatientsImported={(newP) => {
            setPatients((prev) => [...newP, ...prev]);
          }}
        />
      )}

      {/* 3b. EDIT EXISTING PATIENT */}
      {activeView === "patients_edit" && (
        <PatientForm
          initialData={editingPatient || activePatient}
          onSuccess={handlePatientUpdated}
          isLiveDb={isLiveDb}
          patients={patients}
          onPatientsImported={(newP) => {
            setPatients((prev) => [...newP, ...prev]);
          }}
        />
      )}

      {/* 4. PATIENT DETAILS PROFILE */}
      {activeView === "patient_details" && (
        activePatient ? (
          <PatientDetails
            patient={activePatient}
            patients={patients}
            treatments={treatments}
            onAddTreatment={handleTreatmentAdded}
            onEditPatient={handleStartEdit}
          />
        ) : (
          <div className="neu-card p-8 text-center text-xs text-slate-500 space-y-3">
            <p>No patient selected. Please register or select a patient from the registry.</p>
            <button
              onClick={() => setActiveView("patients_new")}
              className="neu-btn px-3 py-1.5 rounded-xl text-xs font-semibold text-[#EAAA00]"
            >
              Register Patient
            </button>
          </div>
        )
      )}

      {/* 5. TREATMENTS LOG */}
      {activeView === "treatments" && (
        <div className="space-y-6 animate-in fade-in duration-300">
          <TreatmentForm
            patientsList={patients}
            injectionsList={injections}
            onTreatmentAdded={handleTreatmentAdded}
          />
          <TreatmentTable
            treatments={treatments}
            isLiveDb={isLiveDb}
            onTreatmentsImported={(newT) => {
              setTreatments((prev) => [...newT, ...prev]);
            }}
          />
        </div>
      )}

      {/* 6. SETTINGS & ADMINISTRATION */}
      {SETTINGS_VIEWS.includes(activeView) && (
        <SettingsModule
          patients={patients}
          setPatients={setPatients}
          treatments={treatments}
          injections={injections}
          setInjections={setInjections}
          history={history}
          setHistory={setHistory}
          isLiveDb={isLiveDb}
        />
      )}

      {/* Bulk Upload Modal for 0-patients empty state */}
      <BulkUploadModal
        isOpen={showEmptyUploadModal}
        onClose={() => setShowEmptyUploadModal(false)}
        entityType="patients"
        title="Seed Registry: Bulk Upload Patients (Excel / CSV)"
        isLiveDb={isLiveDb}
        onSuccess={(imported) => {
          setPatients((prev) => [...imported, ...prev]);
        }}
      />

      {/* CONFIRM DELETE MODAL */}
      <Modal
        isOpen={!!deleteCandidate}
        onClose={() => setDeleteCandidate(null)}
        title="Confirm Record Deletion"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600 dark:text-[#bdaec2]">
            Are you sure you want to delete patient record{" "}
            <strong>
              {deleteCandidate?.registration_no} ({deleteCandidate?.patient_name})
            </strong>
            ? This action will remove their profile and cascade to past infusions.
          </p>

          <div className="neu-inset p-3 rounded-xl text-xs space-y-1">
            <p>
              <strong>Diagnosis:</strong> {deleteCandidate?.diagnosis}
            </p>
            <p>
              <strong>CNIC:</strong> {deleteCandidate?.cnic || "N/A"}
            </p>
            <p>
              <strong>City:</strong> {deleteCandidate?.city}
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={() => setDeleteCandidate(null)}
              className={btnSecondary}
            >
              Cancel
            </button>
            <button onClick={confirmDeleteSingle} className={btnDanger}>
              Confirm Delete
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
