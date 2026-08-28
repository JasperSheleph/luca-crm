"use client";

import { useActionState, useState } from "react";
import {
  createUser, setUserActive, setUserRole, resetPassword,
  type UserActionState,
} from "@/lib/actions/users";
import Button from "@/components/ui/button";
import Card from "@/components/ui/card";
import Badge from "@/components/ui/badge";
import { Field, inputBase, inputClass } from "@/components/ui/field";
import type { AppUser } from "@/lib/types";

const ROLE_LABEL = { admin: "Admin", crm_manager: "CRM Manager", sales_rep: "Sales Rep" } as const;

function Feedback({ state }: { state: UserActionState }) {
  if (state.error) return <p role="alert" className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{state.error}</p>;
  if (!state.message) return null;
  return (
    <div className="rounded-md bg-success/10 px-3 py-2 text-sm text-success">
      <p>{state.message}</p>
      {state.resetLink && (
        <>
          <p className="mt-2 font-medium">Password link — nothing was emailed:</p>
          <code className="mt-1 block break-all rounded bg-paper px-2 py-1 text-xs text-ink">{state.resetLink}</code>
        </>
      )}
    </div>
  );
}

export default function UsersClient({ users, currentUserId }: { users: AppUser[]; currentUserId: string }) {
  const [adding, setAdding] = useState(false);
  const [create, createAction, creating] = useActionState<UserActionState, FormData>(createUser, {});
  const [row, rowAction] = useActionState<UserActionState, FormData>(
    async (prev, fd) => {
      const intent = String(fd.get("intent"));
      if (intent === "active") return setUserActive(prev, fd);
      if (intent === "role") return setUserRole(prev, fd);
      return resetPassword(prev, fd);
    }, {},
  );

  return (
    <div className="space-y-4">
      <Card
        title="People"
        description="Deactivate rather than remove — a deleted user disappears from every activity they logged."
        actions={<Button size="sm" variant="secondary" onClick={() => setAdding((v) => !v)} type="button">{adding ? "Cancel" : "Add someone"}</Button>}
      >
        {adding && (
          <form action={createAction} className="mb-4 grid gap-3 rounded-md border border-border bg-navy-50 p-3 sm:grid-cols-2">
            <Field label="Name" htmlFor="name"><input id="name" name="name" required className={inputClass} /></Field>
            <Field label="Email" htmlFor="email"><input id="email" name="email" type="email" required className={inputClass} /></Field>
            <Field label="Role" htmlFor="role">
              <select id="role" name="role" defaultValue="sales_rep" className={inputClass}>
                <option value="sales_rep">Sales Rep</option>
                <option value="crm_manager">CRM Manager</option>
                <option value="admin">Admin</option>
              </select>
            </Field>
            <Field label="Phone" htmlFor="phone" hint="Optional"><input id="phone" name="phone" className={inputClass} /></Field>
            <div className="sm:col-span-2">
              <Button type="submit" disabled={creating}>{creating ? "Adding…" : "Add"}</Button>
            </div>
            <div className="sm:col-span-2"><Feedback state={create} /></div>
          </form>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-ink-muted">
                <th className="py-2 pr-3 font-medium">Name</th>
                <th className="py-2 pr-3 font-medium">Email</th>
                <th className="py-2 pr-3 font-medium">Role</th>
                <th className="py-2 pr-3 font-medium">Status</th>
                <th className="py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-border last:border-0">
                  <td className="py-2 pr-3 font-medium text-ink">
                    {u.name}{u.id === currentUserId && <span className="ml-1 text-xs text-ink-muted">(you)</span>}
                  </td>
                  <td className="py-2 pr-3 text-ink-muted">{u.email}</td>
                  <td className="py-2 pr-3">
                    <form action={rowAction} className="flex items-center gap-1">
                      <input type="hidden" name="intent" value="role" />
                      <input type="hidden" name="id" value={u.id} />
                      <select name="role" defaultValue={u.role} className={`${inputBase} w-36 py-1`}
                              onChange={(e) => e.currentTarget.form?.requestSubmit()}>
                        {Object.entries(ROLE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                    </form>
                  </td>
                  <td className="py-2 pr-3">
                    {u.is_active ? <Badge tone="success">Active</Badge> : <Badge tone="muted">Inactive</Badge>}
                  </td>
                  <td className="py-2">
                    <div className="flex flex-wrap gap-1">
                      <form action={rowAction}>
                        <input type="hidden" name="intent" value="active" />
                        <input type="hidden" name="id" value={u.id} />
                        <input type="hidden" name="is_active" value={String(!u.is_active)} />
                        <Button size="sm" variant={u.is_active ? "ghost" : "secondary"} type="submit"
                                disabled={u.id === currentUserId && u.is_active}>
                          {u.is_active ? "Deactivate" : "Reactivate"}
                        </Button>
                      </form>
                      <form action={rowAction}>
                        <input type="hidden" name="intent" value="reset" />
                        <input type="hidden" name="email" value={u.email} />
                        <Button size="sm" variant="ghost" type="submit">Password link</Button>
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-3"><Feedback state={row} /></div>
      </Card>
    </div>
  );
}
