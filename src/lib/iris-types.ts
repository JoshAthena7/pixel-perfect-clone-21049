export type IrisMission = {
  id: string;
  name: string | null;
  client?: string | null;
  state?: string | null;
  state_agency?: string | null;
  procurement_name?: string | null;
  program_type?: string | null;
  description?: string | null;
  submission_date?: string | null;
  health?: string | null;
  status?: string | null;
  win_themes?: unknown;
  key_requirements?: unknown;
};

export type IrisData = {
  mission: IrisMission | null;
  missions: IrisMission[];
  signals: any[];
  risks: any[];
  winThemes: any[];
  strategy: any[];
  clientIntel: any | null;
};
