import { flowMermaid, type Flow } from "@/lib/flow";
import { OS_LABEL } from "@/lib/os";
import type { ReactNode } from "react";
import { CopyButton } from "./ui";

// The setup route as columns of cards (how it fits together), each one a jump to where the manual explains it, with
// "Copy as Mermaid". Off the manual page for now (see Report in app/report.tsx); lib/flow.ts still feeds the API.

export function FlowMap({ flow, onJump, children }: { flow: Flow; onJump: (to: string, mode?: "install" | "source") => void; children?: ReactNode }) {
  return (
    <section className="flow" aria-labelledby="flow-h">
      <div className="flow-head">
        <h2 id="flow-h" className="flow-h">
          How it fits together <span className="flow-os">on {OS_LABEL[flow.os]}</span>
        </h2>
        <CopyButton text={`\`\`\`mermaid\n${flowMermaid(flow)}\n\`\`\``} label="Copy as Mermaid" className="btn btn-sm" />
      </div>
      <ol className="flow-cols">
        {flow.groups.map((g) => (
          <li key={g.id} className={`flow-col flow-${g.id}`}>
            <h3 className="flow-title">{g.title}</h3>
            <ul>
              {g.nodes.map((n) => {
                const body = (
                  <>
                    {n.code ? <code className="flow-label">{n.label}</code> : <b className="flow-label">{n.label}</b>}
                    {n.detail && <span className="flow-detail">{n.detail}</span>}
                    {n.secret && <span className="secret">secret</span>}
                  </>
                );
                return (
                  <li key={n.id}>
                    {n.jump ? (
                      <button className={`flow-node${n.best ? " best" : ""}`} onClick={() => onJump(n.jump!.to, n.jump!.mode)}>
                        {body}
                      </button>
                    ) : (
                      <div className="flow-node">{body}</div>
                    )}
                  </li>
                );
              })}
              {g.more > 0 && <li className="flow-more">and {g.more} more</li>}
            </ul>
          </li>
        ))}
      </ol>
      {children}
    </section>
  );
}
