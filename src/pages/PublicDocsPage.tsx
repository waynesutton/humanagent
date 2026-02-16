import { useQuery } from "convex/react";
import { useParams } from "react-router-dom";
import { api } from "../../convex/_generated/api";

function DocShell({
  title,
  content,
  notFound,
}: {
  title: string;
  content: string | null | undefined;
  notFound: string;
}) {
  if (content === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-0">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-surface-3 border-t-accent" />
      </div>
    );
  }

  if (content === null) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8">
        <h1 className="text-xl font-semibold text-ink-0">{title}</h1>
        <p className="mt-3 text-sm text-ink-1">{notFound}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <pre className="overflow-x-auto whitespace-pre-wrap rounded-lg border border-surface-3 bg-surface-0 p-4 text-xs text-ink-0">
        {content}
      </pre>
    </div>
  );
}

export function PublicSitemapPage() {
  const { username } = useParams<{ username: string }>();
  const content = useQuery(
    api.functions.agentDocs.getSitemapContent,
    username ? { username } : "skip"
  );

  return (
    <DocShell
      title="Sitemap"
      content={content}
      notFound="No public sitemap found for this profile."
    />
  );
}

export function PublicLlmsTxtPage() {
  const { username, slug } = useParams<{ username: string; slug?: string }>();
  const llmsByUsername = useQuery(
    api.functions.llmsTxt.getByUsername,
    username && !slug ? { username } : "skip"
  );
  const llmsByAgent = useQuery(
    api.functions.llmsTxt.getByUsernameAndSlug,
    username && slug ? { username, slug } : "skip"
  );
  const llms = llmsByAgent ?? llmsByUsername;

  return (
    <DocShell
      title={slug ? `Agent llms (persona) - ${slug}` : "Profile llms (aggregate)"}
      content={llms?.txtContent ?? (llms === null ? null : undefined)}
      notFound="No llms.txt content found for this profile."
    />
  );
}

export function PublicLlmsFullPage() {
  const { username, slug } = useParams<{ username: string; slug?: string }>();
  const llmsByUsername = useQuery(
    api.functions.llmsTxt.getByUsername,
    username && !slug ? { username } : "skip"
  );
  const llmsByAgent = useQuery(
    api.functions.llmsTxt.getByUsernameAndSlug,
    username && slug ? { username, slug } : "skip"
  );
  const llms = llmsByAgent ?? llmsByUsername;

  return (
    <DocShell
      title={
        slug
          ? `Agent llms full (persona) - ${slug}`
          : "Profile llms full (aggregate)"
      }
      content={llms?.mdContent ?? (llms === null ? null : undefined)}
      notFound="No llms-full.md content found for this profile."
    />
  );
}

export function PublicApiDocsPage() {
  const { username } = useParams<{ username: string }>();
  const content = useQuery(
    api.functions.agentDocs.getApiDocsContent,
    username ? { username } : "skip"
  );

  return (
    <DocShell
      title="API Docs"
      content={content}
      notFound="No API docs found for this profile."
    />
  );
}

export function PublicToolsDocsPage() {
  const { username } = useParams<{ username: string }>();
  const content = useQuery(
    api.functions.agentDocs.getToolsDocsContent,
    username ? { username } : "skip"
  );

  return (
    <DocShell
      title="Tools Docs"
      content={content}
      notFound="No tools docs found for this profile."
    />
  );
}

export function PublicOpenApiPage() {
  const { username } = useParams<{ username: string }>();
  const content = useQuery(
    api.functions.agentDocs.getOpenApiContent,
    username ? { username } : "skip"
  );

  return (
    <DocShell
      title="OpenAPI"
      content={content}
      notFound="No OpenAPI content found for this profile."
    />
  );
}
