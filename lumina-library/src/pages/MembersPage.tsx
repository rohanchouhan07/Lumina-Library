import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Download,
  Eye,
  Mail,
  MoreHorizontal,
  Pencil,
  RotateCcw,
  UserCheck,
  UserPlus,
  UserX,
} from 'lucide-react'
import type { Member } from '@/types'
import { useLibrary } from '@/providers/LibraryProvider'
import { useAuth } from '@/providers/AuthProvider'
import { useToast } from '@/providers/ToastProvider'
import { memberActiveLoans, memberOutstandingFines } from '@/features/library/engine'
import { exportMembersCsv } from '@/lib/exportUtils'
import { formatDate } from '@/lib/dateUtils'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/Button'
import { Badge, StatusPill } from '@/components/ui/Badge'
import { SearchInput, Select } from '@/components/ui/Field'
import { Table, TableWrap, Td, Th, Tr } from '@/components/ui/Table'
import { EmptyState } from '@/components/ui/Feedback'
import { Avatar } from '@/components/ui/Avatar'
import { MenuItem, MenuSeparator, Popover } from '@/components/ui/Menu'
import { MemberFormDialog } from '@/components/members/MemberFormDialog'
import { MemberDetailDialog } from '@/components/members/MemberDetailDialog'
import { cn } from '@/lib/utils'

export function MembersPage() {
  const { data } = useLibrary()
  const { can } = useAuth()
  const toast = useToast()
  const [searchParams, setSearchParams] = useSearchParams()
  const [query, setQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState<'all' | Member['role']>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | Member['status']>('all')
  const [departmentFilter, setDepartmentFilter] = useState('all')
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Member | null>(null)
  const [detail, setDetail] = useState<Member | null>(null)

  const canManage = can('members.create')
  const canToggle = can('members.toggleStatus')
  const { toggleMemberStatus } = useLibrary()

  const departments = useMemo(
    () => Array.from(new Set(data.members.map((member) => member.department))).sort(),
    [data.members],
  )

  useEffect(() => {
    const memberId = searchParams.get('member')
    if (memberId) {
      const member = data.members.find((item) => item.id === memberId)
      if (member) setDetail(member)
      const next = new URLSearchParams(searchParams)
      next.delete('member')
      setSearchParams(next, { replace: true })
    } else if (searchParams.get('new') && canManage) {
      setEditing(null)
      setFormOpen(true)
      const next = new URLSearchParams(searchParams)
      next.delete('new')
      setSearchParams(next, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase()
    return data.members
      .filter((member) => {
        if (roleFilter !== 'all' && member.role !== roleFilter) return false
        if (statusFilter !== 'all' && member.status !== statusFilter) return false
        if (departmentFilter !== 'all' && member.department !== departmentFilter) return false
        if (!term) return true
        return (
          member.name.toLowerCase().includes(term) ||
          member.email.toLowerCase().includes(term) ||
          member.id.toLowerCase().includes(term) ||
          member.department.toLowerCase().includes(term)
        )
      })
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [data.members, query, roleFilter, statusFilter, departmentFilter])

  const activeFilters =
    (roleFilter !== 'all' ? 1 : 0) + (statusFilter !== 'all' ? 1 : 0) + (departmentFilter !== 'all' ? 1 : 0)

  const reset = () => {
    setQuery('')
    setRoleFilter('all')
    setStatusFilter('all')
    setDepartmentFilter('all')
  }

  const handleToggle = async (member: Member) => {
    const result = await toggleMemberStatus(member.id)
    if (!result.ok) {
      toast.error('Membership not updated', result.error)
      return
    }
    toast.success(
      result.value.status === 'active' ? 'Membership activated' : 'Membership deactivated',
      result.value.name,
    )
  }

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="People"
        title="Member management"
        description="Students and staff registered with the library, their borrowing limits and outstanding simulated fines."
        actions={
          <>
            <Button
              variant="secondary"
              size="sm"
              leftIcon={<Download />}
              onClick={() => {
                exportMembersCsv(filtered, data)
                toast.success('Members exported', `${filtered.length} records written to CSV.`)
              }}
            >
              Export
            </Button>
            {canManage && (
              <Button
                size="sm"
                leftIcon={<UserPlus />}
                onClick={() => {
                  setEditing(null)
                  setFormOpen(true)
                }}
              >
                Register member
              </Button>
            )}
          </>
        }
      />

      <div className="surface-card flex flex-col gap-2.5 rounded-xl p-3 lg:flex-row lg:items-center">
        <SearchInput
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onClear={() => setQuery('')}
          placeholder="Search name, email, ID or department…"
          aria-label="Search members"
          className="w-full lg:max-w-sm"
        />
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={roleFilter}
            onChange={(event) => setRoleFilter(event.target.value as typeof roleFilter)}
            aria-label="Filter by role"
            className="w-auto min-w-30"
          >
            <option value="all">All roles</option>
            <option value="student">Students</option>
            <option value="librarian">Librarians</option>
            <option value="admin">Administrators</option>
          </Select>
          <Select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}
            aria-label="Filter by status"
            className="w-auto min-w-30"
          >
            <option value="all">Any status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </Select>
          <Select
            value={departmentFilter}
            onChange={(event) => setDepartmentFilter(event.target.value)}
            aria-label="Filter by department"
            className="w-auto min-w-36"
          >
            <option value="all">All departments</option>
            {departments.map((department) => (
              <option key={department} value={department}>
                {department}
              </option>
            ))}
          </Select>
          {activeFilters > 0 && (
            <Button variant="ghost" size="sm" leftIcon={<RotateCcw />} onClick={reset}>
              Reset
            </Button>
          )}
          <span className="ml-auto text-[11.5px] text-fg-muted">{filtered.length} members</span>
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<UserX />}
          title="No members match these filters"
          description="Try a different search term, or reset the filters to list everyone."
          action={
            <Button variant="secondary" size="sm" onClick={reset}>
              Clear filters
            </Button>
          }
        />
      ) : (
        <>
          <TableWrap className="hidden md:block">
            <Table>
              <thead>
                <tr>
                  <Th>Member</Th>
                  <Th>Contact</Th>
                  <Th>Department</Th>
                  <Th>Role</Th>
                  <Th>Status</Th>
                  <Th className="text-center">On loan</Th>
                  <Th className="text-right">Fines</Th>
                  <Th>Joined</Th>
                  <Th className="text-right">Actions</Th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((member) => {
                  const active = memberActiveLoans(data, member.id).length
                  const fines = memberOutstandingFines(data, member.id)
                  return (
                    <Tr key={member.id}>
                      <Td>
                        <div className="flex items-center gap-2.5">
                          <Avatar name={member.name} size="sm" />
                          <div className="min-w-0">
                            <p className="truncate font-medium text-fg">{member.name}</p>
                            <p className="text-[10.5px] text-fg-faint">{member.id}</p>
                          </div>
                        </div>
                      </Td>
                      <Td>
                        <span className="inline-flex items-center gap-1.5 text-[11.5px] text-fg-muted">
                          <Mail className="size-3" aria-hidden="true" />
                          <span className="max-w-[190px] truncate">{member.email}</span>
                        </span>
                      </Td>
                      <Td className="text-[12px]">{member.department}</Td>
                      <Td>
                        <Badge tone={member.role === 'admin' ? 'brand' : member.role === 'librarian' ? 'violet' : 'cyan'}>
                          {member.role}
                        </Badge>
                      </Td>
                      <Td>
                        <StatusPill
                          tone={member.status === 'active' ? 'success' : 'neutral'}
                          label={member.status === 'active' ? 'Active' : 'Inactive'}
                        />
                      </Td>
                      <Td className="text-center tabular-nums">{active}</Td>
                      <Td className={cn('text-right tabular-nums', fines > 0 && 'text-warn-400')}>
                        {fines > 0 ? `₹${fines}` : '—'}
                      </Td>
                      <Td className="text-[11.5px] whitespace-nowrap text-fg-muted">{formatDate(member.joinedAt)}</Td>
                      <Td>
                        <div className="flex items-center justify-end gap-1">
                          <Button size="xs" variant="ghost" onClick={() => setDetail(member)}>
                            <Eye className="size-3.5" aria-hidden="true" />
                            <span className="sr-only">View {member.name}</span>
                          </Button>
                          {canManage && (
                            <Popover
                              label={`Actions for ${member.name}`}
                              trigger={({ toggle, ref, open }) => (
                                <Button
                                  ref={ref}
                                  size="xs"
                                  variant="ghost"
                                  aria-expanded={open}
                                  onClick={toggle}
                                  aria-label={`More actions for ${member.name}`}
                                >
                                  <MoreHorizontal className="size-3.5" aria-hidden="true" />
                                </Button>
                              )}
                            >
                              {(close) => (
                                <>
                                  <MenuItem
                                    icon={<Eye />}
                                    onClick={() => {
                                      setDetail(member)
                                      close()
                                    }}
                                  >
                                    View record
                                  </MenuItem>
                                  <MenuItem
                                    icon={<Pencil />}
                                    onClick={() => {
                                      setEditing(member)
                                      setFormOpen(true)
                                      close()
                                    }}
                                  >
                                    Edit member
                                  </MenuItem>
                                  {canToggle && (
                                    <>
                                      <MenuSeparator />
                                      <MenuItem
                                        icon={member.status === 'active' ? <UserX /> : <UserCheck />}
                                        destructive={member.status === 'active'}
                                        onClick={() => {
                                          handleToggle(member)
                                          close()
                                        }}
                                      >
                                        {member.status === 'active' ? 'Deactivate' : 'Activate'}
                                      </MenuItem>
                                    </>
                                  )}
                                </>
                              )}
                            </Popover>
                          )}
                        </div>
                      </Td>
                    </Tr>
                  )
                })}
              </tbody>
            </Table>
          </TableWrap>

          <ul className="space-y-2 md:hidden">
            {filtered.map((member) => {
              const active = memberActiveLoans(data, member.id).length
              const fines = memberOutstandingFines(data, member.id)
              return (
                <li key={member.id} className="surface-card rounded-xl p-3">
                  <div className="flex items-start gap-2.5">
                    <Avatar name={member.name} size="md" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium text-fg">{member.name}</p>
                      <p className="truncate text-[11px] text-fg-muted">{member.email}</p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <Badge tone={member.role === 'admin' ? 'brand' : member.role === 'librarian' ? 'violet' : 'cyan'}>
                          {member.role}
                        </Badge>
                        <StatusPill
                          tone={member.status === 'active' ? 'success' : 'neutral'}
                          label={member.status === 'active' ? 'Active' : 'Inactive'}
                        />
                        <span className="text-[10.5px] text-fg-faint">{member.department}</span>
                      </div>
                      <div className="mt-2 flex items-center gap-3 text-[11px] text-fg-muted">
                        <span>{active} on loan</span>
                        <span className={fines > 0 ? 'text-warn-400' : ''}>{fines > 0 ? `₹${fines} fines` : 'No fines'}</span>
                      </div>
                    </div>
                  </div>
                  <div className="mt-2.5 flex gap-2">
                    <Button size="xs" variant="secondary" className="flex-1" onClick={() => setDetail(member)}>
                      View record
                    </Button>
                    {canManage && (
                      <Button
                        size="xs"
                        variant="ghost"
                        onClick={() => {
                          setEditing(member)
                          setFormOpen(true)
                        }}
                      >
                        Edit
                      </Button>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        </>
      )}

      <MemberFormDialog open={formOpen} onOpenChange={setFormOpen} member={editing} />
      <MemberDetailDialog
        member={detail}
        open={Boolean(detail)}
        onOpenChange={(open) => !open && setDetail(null)}
        onEdit={(member) => {
          setDetail(null)
          setEditing(member)
          setFormOpen(true)
        }}
      />
    </div>
  )
}
