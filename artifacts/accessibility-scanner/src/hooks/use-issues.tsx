import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Issue, IssueDetailData, Person, IssueAttachment, IssueLinkType, IssueRelationship } from "../lib/issue-types";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE}${url}`, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
  });
  if (response.status === 204) return undefined as T;
  const body = await response.json();
  if (!response.ok) throw new Error(body?.error ?? "Something went wrong");
  return body as T;
}

export function useIssues() {
  return useQuery({
    queryKey: ["issues"],
    queryFn: () => api<{ issues: Issue[]; metrics: any }>("/api/issues"),
    // Issue Management is user-driven rather than a live dashboard. Keep the
    // current list stable while the user works and let mutations invalidate it
    // when an explicit change has been made. A full browser refresh still
    // fetches the latest server state.
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}

export function useIssue(id: number | null) {
  return useQuery({
    queryKey: ["issues", id],
    queryFn: () => api<IssueDetailData>(`/api/issues/${id}`),
    enabled: !!id,
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}

export function usePeople() {
  return useQuery({
    queryKey: ["issues-people"],
    queryFn: () => api<Person[]>("/api/issues/people"),
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}

export function useCreateIssue() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Issue>) => api<Issue>("/api/issues", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["issues"] }),
  });
}

export function useUpdateIssue(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Issue>) => api<Issue>(`/api/issues/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["issues"] });
      qc.invalidateQueries({ queryKey: ["issues", id] });
    },
  });
}

export function useAddComment(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { body: string; mentionIds?: number[]; attachments?: IssueAttachment[] }) => 
      api<any>(`/api/issues/${id}/comments`, { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["issues", id] }),
  });
}

export function useArchiveIssue() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api<any>(`/api/issues/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["issues"] }),
  });
}

export function useAddIssueLink(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { targetIssueId: number; linkType: IssueLinkType }) =>
      api<IssueRelationship>(`/api/issues/${id}/links`, { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["issues"] });
      qc.invalidateQueries({ queryKey: ["issues", id] });
    },
  });
}

export function useRemoveIssueLink(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (linkId: number) => api<void>(`/api/issues/${id}/links/${linkId}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["issues"] });
      qc.invalidateQueries({ queryKey: ["issues", id] });
    },
  });
}

export function useUploadAttachment(issueId: number) {
  return useMutation({
    mutationFn: async (file: File): Promise<IssueAttachment> => {
      // 1. Get upload URL
      const { uploadURL, attachment } = await api<{ uploadURL: string; attachment: IssueAttachment }>(
        `/api/issues/${issueId}/attachments/upload-url`,
        {
          method: "POST",
          body: JSON.stringify({
            filename: file.name,
            contentType: file.type,
            size: file.size,
          }),
        }
      );
      // 2. Upload file bytes directly
      const putRes = await fetch(uploadURL, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!putRes.ok) throw new Error("Failed to upload file bytes");
      return attachment;
    },
  });
}
