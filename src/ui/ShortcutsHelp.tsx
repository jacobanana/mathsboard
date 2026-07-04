// The "Keyboard shortcuts" help sheet (burger menu -> Keyboard shortcuts, or the
// "?" key). Pure view over the shortcut catalog: it renders whatever shortcuts.ts
// declares, grouped and gated by build, so adding a shortcut there makes it show
// up here automatically. Renders only the modal .card body per the dialog
// contract (the Modal shell owns .card).

import { shortcutsByGroup } from "@/ui/shortcuts";
import type { ShortcutSpec } from "@/ui/shortcuts";

/** One shortcut's key combos: alternatives separated by "/", combo parts by
 *  "+", each atomic key in its own <kbd>. */
function Keys({ combos }: { combos: ShortcutSpec["keys"] }): JSX.Element {
  return (
    <span className="sc-keys">
      {combos.map((combo, i) => (
        <span className="sc-combo" key={i}>
          {i > 0 && <span className="sc-or">/</span>}
          {combo.map((k, j) => (
            <span className="sc-combo" key={j}>
              {j > 0 && <span className="sc-plus">+</span>}
              <kbd>{k}</kbd>
            </span>
          ))}
        </span>
      ))}
    </span>
  );
}

export function ShortcutsHelp(): JSX.Element {
  const groups = shortcutsByGroup();
  return (
    <>
      <h2>Keyboard shortcuts</h2>
      <p className="hint">
        Most tools and actions have a key. On a Mac, use ⌘ wherever Ctrl is
        shown.
      </p>
      <div className="shortcuts">
        {groups.map((g) => (
          <section className="sc-group" key={g.group}>
            <h3 className="gsub">{g.label}</h3>
            <dl>
              {g.items.map((s) => (
                <div className="sc-row" key={s.id}>
                  <dt>
                    <Keys combos={s.keys} />
                  </dt>
                  <dd>{s.label}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </>
  );
}
