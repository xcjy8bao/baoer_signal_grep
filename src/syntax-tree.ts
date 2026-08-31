import type { SyntaxAnalysis, SyntaxNode } from "./syntax-types.js";

export function syntaxField(
  analysis: Pick<SyntaxAnalysis, "nodes" | "children">,
  node: number,
  field: string,
): number | undefined {
  return analysis.children[node]?.find((child) => analysis.nodes[child]?.field === field);
}

export function syntaxFields(
  analysis: Pick<SyntaxAnalysis, "nodes" | "children">,
  node: number,
  field: string,
): number[] {
  return analysis.children[node]?.filter((child) => analysis.nodes[child]?.field === field) ?? [];
}

export function syntaxText(node: SyntaxNode, text: string): string {
  return text.slice(node.start, node.end);
}

export function syntaxChildren(nodes: readonly SyntaxNode[]): number[][] {
  const children: number[][] = Array.from({ length: nodes.length }, () => []);
  for (let i = 0; i < nodes.length; i++) {
    const parent = nodes[i]?.parent;
    if (parent !== null && parent !== undefined) children[parent]?.push(i);
  }
  return children;
}
