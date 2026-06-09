import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";

export type ExportMember = {
  first_name: string | null;
  last_name: string | null;
  email: string;
  phone: string | null;
  job_title: string | null;
  talentdesk_status: string | null;
  atlas_role: string | null;
  atlas_invite_status: string | null;
  atlas_invite_sent_at: string | null;
  atlas_first_login_at: string | null;
  atlas_last_active_at: string | null;
  atlas_profile_completeness: number | null;
  skills: string[] | null;
  languages: string[] | null;
  address: string | null;
  talentdesk_date_joined: string | null;
  talentdesk_invited_by: string | null;
};

const EXPORT_COLUMNS = [
  "id,first_name,last_name,email,phone,job_title,talentdesk_status,atlas_role,",
  "atlas_invite_status,atlas_invite_sent_at,atlas_first_login_at,atlas_last_active_at,",
  "atlas_profile_completeness,skills,languages,address,talentdesk_date_joined,talentdesk_invited_by",
].join("");

const TD_STATUS_LABEL: Record<string, string> = {
  approved: "Approved",
  pending_onboarding: "Pending Onboarding",
};
const ATLAS_STATUS_LABEL: Record<string, string> = {
  not_invited: "Not Invited",
  invite_sent: "Invite Sent",
  active: "Active",
  never_logged_in: "Never Logged In",
  onboarding_incomplete: "Onboarding Incomplete",
};
const ROLE_LABEL: Record<string, string> = {
  admin: "Admin",
  engagement_lead: "Engagement Lead",
  writer: "Writer",
  sme: "SME",
  reviewer: "Reviewer",
  unassigned: "Unassigned",
};

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const HEADERS = [
  "First Name",
  "Last Name",
  "Email",
  "Phone",
  "Job Title",
  "TalentDesk Status",
  "ATLAS Role",
  "ATLAS Status",
  "Missions Assigned",
  "Invite Sent Date",
  "First Login Date",
  "Last Active Date",
  "Profile Completeness",
  "Skills",
  "Languages",
  "Address",
  "Date Joined TalentDesk",
  "Invited By",
];

export async function fetchFullRosterForExport(): Promise<ExportMember[]> {
  const { data, error } = await supabase
    .from("atlas_team_members")
    .select(EXPORT_COLUMNS)
    .eq("is_removed", false);
  if (error) throw error;
  return (data ?? []) as unknown as ExportMember[];
}

export function buildAndDownloadRosterXlsx(rows: ExportMember[]) {
  const aoa: (string | number)[][] = [HEADERS];
  for (const m of rows) {
    aoa.push([
      m.first_name ?? "",
      m.last_name ?? "",
      m.email ?? "",
      m.phone ?? "",
      m.job_title ?? "",
      TD_STATUS_LABEL[m.talentdesk_status ?? ""] ?? (m.talentdesk_status ?? ""),
      ROLE_LABEL[m.atlas_role ?? ""] ?? (m.atlas_role ?? ""),
      ATLAS_STATUS_LABEL[m.atlas_invite_status ?? ""] ?? (m.atlas_invite_status ?? ""),
      0,
      fmtDate(m.atlas_invite_sent_at),
      fmtDate(m.atlas_first_login_at),
      fmtDate(m.atlas_last_active_at),
      m.atlas_profile_completeness ?? 0,
      (m.skills ?? []).filter(Boolean).join(", "),
      (m.languages ?? []).filter(Boolean).join(", "),
      m.address ?? "",
      fmtDate(m.talentdesk_date_joined),
      m.talentdesk_invited_by ?? "",
    ]);
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa);

  // Auto-size column widths
  const widths = HEADERS.map((h, ci) => {
    let max = String(h).length;
    for (let r = 1; r < aoa.length; r++) {
      const v = aoa[r][ci];
      const len = v == null ? 0 : String(v).length;
      if (len > max) max = len;
    }
    return { wch: Math.min(60, Math.max(10, max + 2)) };
  });
  ws["!cols"] = widths;

  // Freeze header row
  ws["!freeze"] = { xSplit: 0, ySplit: 1 } as never;
  ws["!views"] = [{ state: "frozen", ySplit: 1, xSplit: 0, topLeftCell: "A2", activePane: "bottomLeft" }] as never;

  // Style header (navy bg, white bold) and alternating rows
  const range = XLSX.utils.decode_range(ws["!ref"]!);
  const headerStyle = {
    font: { bold: true, color: { rgb: "FFFFFF" } },
    fill: { fgColor: { rgb: "0B1E3F" }, patternType: "solid" },
    alignment: { vertical: "center", horizontal: "left" },
  };
  const zebraStyle = {
    fill: { fgColor: { rgb: "F5F6F8" }, patternType: "solid" },
  };
  for (let c = range.s.c; c <= range.e.c; c++) {
    const ref = XLSX.utils.encode_cell({ r: 0, c });
    const cell = ws[ref];
    if (cell) (cell as { s?: unknown }).s = headerStyle;
  }
  for (let r = 1; r <= range.e.r; r++) {
    if (r % 2 === 0) {
      for (let c = range.s.c; c <= range.e.c; c++) {
        const ref = XLSX.utils.encode_cell({ r, c });
        const cell = ws[ref];
        if (cell) (cell as { s?: unknown }).s = zebraStyle;
      }
    }
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Athena Team Roster");

  const today = new Date();
  const y = today.getFullYear();
  const mo = String(today.getMonth() + 1).padStart(2, "0");
  const d = String(today.getDate()).padStart(2, "0");
  const filename = `Athena-Team-Roster-${y}-${mo}-${d}.xlsx`;

  XLSX.writeFile(wb, filename, { compression: true });
}
