export async function extractPdfText(bytes: ArrayBuffer): Promise<string> {
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

export async function extractDocxText(bytes: ArrayBuffer): Promise<string> {
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

export async function findLatestRfp(supabase: any, missionId: string): Promise<string | null> {
  const { data } = await supabase
    .from("mission_documents")
    .select("id")
    .eq("mission_id", missionId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}

export async function loadRfpText(
  supabase: any,
  documentId: string | null,
): Promise<{ text: string; filename: string; missionId: string }> {
  if (!documentId) throw new Error("No RFP document found");
  const { data, error } = await supabase
    .from("mission_documents")
    .select("id, mission_id, filename, title, content_text, content_summary")
    .eq("id", documentId)
    .maybeSingle();
  if (error || !data) throw new Error("RFP document not found");
  return {
    text: data.content_text ?? data.content_summary ?? "",
    filename: data.filename ?? data.title ?? "RFP document",
    missionId: data.mission_id,
  };
}