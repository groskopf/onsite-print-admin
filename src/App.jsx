import { useEffect, useMemo, useRef, useState } from 'react'
import { fetchCollection } from './api.js'

const API_PREFIX = '/api/v2'
const eventColors = ['blue', 'violet', 'teal']

export function Icon({ name, size = 20 }) {
  const paths = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></>,
    ticket: <><path d="M4 5h16v4a3 3 0 0 0 0 6v4H4v-4a3 3 0 0 0 0-6V5Z" /><path d="M13 8v2m0 4v2" /></>,
    people: <><path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="10" cy="7" r="4" /><path d="M20 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,
    printer: <><path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><path d="M6 14h12v7H6z" /><path d="M18 12h.01" /></>,
    help: <><circle cx="12" cy="12" r="10" /><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3m.1 4h.01" /></>,
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
    chevron: <path d="m9 18 6-6-6-6" />,
    chevronLeft: <path d="m15 18-6-6 6-6" />,
    arrow: <><path d="M7 17 17 7M7 7h10v10" /></>,
    edit: <><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></>,
    trash: <><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" /><path d="M10 11v6M14 11v6" /></>,
    check: <path d="M20 6 9 17l-5-5" />,
    close: <path d="M18 6 6 18M6 6l12 12" />,
    plus: <path d="M12 5v14M5 12h14" />,
    upload: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="m17 8-5-5-5 5M12 3v12" /></>,
  }

  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[name]}
    </svg>
  )
}

async function sendRequest(path, method, body) {
  const response = await fetch(`${API_PREFIX}/${path}`, {
    method,
    headers: {
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })

  const data = await response.json().catch(() => null)
  if (!response.ok) {
    let detail = response.statusText
    if (typeof data?.detail === 'string') detail = data.detail
    else if (Array.isArray(data?.detail)) {
      detail = data.detail.map((item) => item.msg?.replace(/^Value error, /, '')).filter(Boolean).join('; ')
    }
    throw new Error(`${detail || 'Request failed'} (${response.status})`)
  }
  return data
}

const EDITABLE_EVENT_FIELDS = ['name', 'start_date', 'end_date', 'street', 'zip', 'town', 'country']

function toEventDraft(event) {
  return Object.fromEntries(EDITABLE_EVENT_FIELDS.map((key) => [key, event[key] ?? '']))
}

function toEventPayload(draft) {
  return Object.fromEntries(EDITABLE_EVENT_FIELDS.map((key) => {
    const value = draft[key].trim()
    return [key, value === '' && !['name', 'start_date', 'end_date'].includes(key) ? null : value]
  }))
}

function parseDate(value) {
  if (!value) return null
  const [year, month, day] = value.split('-').map(Number)
  const parsed = new Date(year, month - 1, day)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function formatDateRange(startDate, endDate) {
  const start = parseDate(startDate)
  const end = parseDate(endDate)
  if (!start || !end) return 'Dates not set'

  const dateOptions = { day: 'numeric', month: 'short' }
  const startLabel = new Intl.DateTimeFormat('en-GB', dateOptions).format(start)
  const endLabel = new Intl.DateTimeFormat('en-GB', dateOptions).format(end)
  const year = new Intl.DateTimeFormat('en-GB', { year: 'numeric' }).format(end)

  if (start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()) {
    if (start.getDate() === end.getDate()) return `${startLabel} ${year}`
    return `${start.getDate()}–${end.getDate()} ${new Intl.DateTimeFormat('en-GB', { month: 'short' }).format(end)} ${year}`
  }
  if (start.getFullYear() !== end.getFullYear()) {
    return `${startLabel} ${start.getFullYear()} – ${endLabel} ${year}`
  }
  return `${startLabel} – ${endLabel} ${year}`
}

function isPastEvent(event) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const end = parseDate(event.end_date)
  return Boolean(end) && end < today
}

// Current/upcoming events by ascending start date; past events (if shown) after them, most recently ended first.
function getVisibleEvents(events, showPast) {
  const byStart = (left, right) =>
    left.start_date.localeCompare(right.start_date) || left.name.localeCompare(right.name)
  const current = events.filter((event) => !isPastEvent(event)).sort(byStart)
  if (!showPast) return current
  const past = events.filter(isPastEvent).sort((left, right) =>
    right.end_date.localeCompare(left.end_date) || byStart(left, right))
  return [...current, ...past]
}

function getEventStatus(event) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const start = parseDate(event.start_date)
  const end = parseDate(event.end_date)

  if (!start || !end) return 'Date unavailable'
  if (end < today) return 'Past'
  if (start <= today) return 'In progress'
  return 'Upcoming'
}

function getInitials(name) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
}

export function Sidebar({ activeView, onNavigate, eventMode = false, eventOpen = false, onLogout }) {
  const navigation = eventMode ? (eventOpen ? [
    ['calendar', 'Event', 'event'],
    ['people', 'Attendees', 'attendees'],
    ['check', 'Check-in', 'checkin'],
  ] : []) : [
    ['grid', 'Overview'],
    ['calendar', 'Events', 'events'],
    ['ticket', 'Bookings', 'bookings'],
    ['printer', 'Printers', 'printers'],
  ]

  return (
    <aside className="sidebar" aria-label="Main navigation">
      <a className="brand" href={eventMode ? '/event/' : '#workspace'} aria-label="Onsite Print home">
        <span className="brand-mark"><span /><span /><span /></span>
        <span className="brand-name">ONSITE<br />PRINT</span>
      </a>

      <nav className="primary-nav">
        {navigation.map(([icon, label, view]) => {
          const active = view !== undefined && view === activeView
          return (
            <button
              className={`nav-item${active ? ' active' : ''}`}
              key={label}
              type="button"
              aria-current={active ? 'page' : undefined}
              onClick={view && onNavigate ? () => onNavigate(view) : undefined}
              title={label}
            >
              <Icon name={icon} size={21} />
              <span>{label}</span>
            </button>
          )
        })}
      </nav>

      <div className="sidebar-bottom">
        {eventMode && eventOpen && <button className="nav-item" type="button" onClick={onLogout}>
          <Icon name="chevronLeft" size={20} />
          <span>Log out</span>
        </button>}
        {!eventMode && <button className="nav-item" type="button" title="Help">
          <Icon name="help" size={20} />
          <span>Help</span>
        </button>}
        {eventMode ? <div className="profile-button">
          <span className="avatar">OP</span>
          <span className="profile-label">Event</span>
        </div> : <button className="profile-button" type="button" aria-label="Account menu">
          <span className="avatar">OP</span>
          <span className="profile-label">Admin</span>
        </button>}
      </div>
    </aside>
  )
}

function EventOverview({
  events,
  bookings,
  selectedEventCode,
  onSelect,
  onCreate,
  creating,
  showPast,
  onShowPastChange,
  loading,
  error,
  onRetry,
}) {
  const [search, setSearch] = useState('')
  const sortedEvents = useMemo(() => getVisibleEvents(events, showPast), [events, showPast])
  const hiddenPastCount = showPast ? 0 : events.length - sortedEvents.length
  const filteredEvents = sortedEvents.filter((event) => {
    const query = search.trim().toLocaleLowerCase()
    return !query || [event.name, event.code, event.town, event.country]
      .filter(Boolean)
      .some((value) => value.toLocaleLowerCase().includes(query))
  })

  return (
    <section className="overview-panel" aria-labelledby="events-heading">
      <div className="overview-heading">
        <div>
          <p className="eyebrow">Workspace</p>
          <h1 id="events-heading">Events</h1>
        </div>
        <button
          className="new-event-button"
          disabled={loading || Boolean(error) || creating}
          onClick={onCreate}
          type="button"
          aria-label="New event"
          title="New event"
        >
          <Icon name="plus" size={16} />
          <span>New</span>
        </button>
      </div>

      <label className="search-field">
        <Icon name="search" size={18} />
        <input
          aria-label="Search events"
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search events"
          type="search"
          value={search}
        />
      </label>

      <label className="show-past-toggle">
        <input
          checked={showPast}
          onChange={(event) => onShowPastChange(event.target.checked)}
          type="checkbox"
        />
        <span>Show all events, including past events</span>
      </label>

      <div className="list-summary">
        <span>
          {showPast ? 'All events' : 'Current events'}{' '}
          <span className="count-badge">{sortedEvents.length}</span>
        </span>
        <span className="sort-label">By start date</span>
      </div>

      {error && (
        <div className="load-error" role="alert">
          <strong>Couldn’t load event data</strong>
          <span>{error}</span>
          <button type="button" onClick={onRetry}>Try again</button>
        </div>
      )}

      <div className="event-list" aria-live="polite">
        {loading && <p className="list-message">Loading events…</p>}
        {!loading && !error && events.length === 0 && (
          <p className="list-message">No events have been added yet.</p>
        )}
        {!loading && !error && events.length > 0 && sortedEvents.length === 0 && (
          <p className="list-message">
            No current or upcoming events. {hiddenPastCount} past {hiddenPastCount === 1 ? 'event is' : 'events are'} hidden.
          </p>
        )}
        {!loading && !error && sortedEvents.length > 0 && filteredEvents.length === 0 && (
          <p className="list-message">No events match “{search}”.</p>
        )}
        {!loading && !error && filteredEvents.map((event, index) => {
          const selected = !creating && event.code === selectedEventCode
          const eventBookings = bookings.filter((booking) => booking.event_code === event.code)
          const status = getEventStatus(event)
          return (
            <button
              className={`event-card${selected ? ' selected' : ''}`}
              key={event.code}
              type="button"
              aria-pressed={selected}
              onClick={() => onSelect(event.code)}
            >
              <span className={`event-initials ${eventColors[index % eventColors.length]}`}>
                {getInitials(event.name)}
              </span>
              <span className="event-card-copy">
                <span className="event-card-title">{event.name}</span>
                <span className="event-card-meta">{formatDateRange(event.start_date, event.end_date)}</span>
                <span className="event-card-bottom">
                  <span>{eventBookings.length} {eventBookings.length === 1 ? 'booking' : 'bookings'}</span>
                  <span className={`status-dot ${status === 'Past' ? 'past' : status === 'Upcoming' ? '' : 'draft'}`} />
                  <span>{status}</span>
                </span>
              </span>
              <Icon name="chevron" size={17} />
            </button>
          )
        })}
      </div>

      <div className="overview-footnote">
        <span className="live-indicator" />
        <span>Live event data</span>
      </div>
    </section>
  )
}

function Field({ label, value, wide = false, type = 'text', editable = false, onChange, required = false }) {
  return (
    <label className={`field${wide ? ' field-wide' : ''}`}>
      <span className="field-label">{label}{editable && required && <span className="required-mark"> *</span>}</span>
      <input
        aria-readonly={editable ? undefined : 'true'}
        onChange={editable ? (event) => onChange(event.target.value) : undefined}
        readOnly={!editable}
        required={editable && required}
        type={type}
        value={value ?? ''}
      />
    </label>
  )
}

function periodsOverlap(startA, endA, startB, endB) {
  return startA <= endB && startB <= endA
}

function NewBookingPanel({ event, events, onEventChange, allBookings, printers, nametagTypes, onCreated, onClose }) {
  const [startDate, setStartDate] = useState(event?.start_date ?? '')
  const [endDate, setEndDate] = useState(event?.end_date ?? '')
  const [nametagType, setNametagType] = useState(nametagTypes[0]?.code ?? '')
  const [selected, setSelected] = useState(() => new Set())
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState('')

  const validPeriod = Boolean(startDate && endDate && startDate <= endDate)
  const { available, bookedCount } = useMemo(() => {
    if (!validPeriod) return { available: [], bookedCount: 0 }
    const busyPrinters = new Set(
      allBookings
        .filter((booking) => periodsOverlap(startDate, endDate, booking.start_date, booking.end_date))
        .map((booking) => booking.printer_code),
    )
    const sorted = [...printers].sort((left, right) =>
      left.label.localeCompare(right.label, undefined, { numeric: true }))
    return {
      available: sorted.filter((printer) => !busyPrinters.has(printer.code)),
      bookedCount: sorted.filter((printer) => busyPrinters.has(printer.code)).length,
    }
  }, [allBookings, printers, startDate, endDate, validPeriod])

  const availableCodes = new Set(available.map((printer) => printer.code))
  const chosen = [...selected].filter((code) => availableCodes.has(code))

  const togglePrinter = (code) => {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(code)) next.delete(code)
      else next.add(code)
      return next
    })
  }

  const submit = async (submitEvent) => {
    submitEvent.preventDefault()
    if (!event) {
      setFormError('Select an event first.')
      return
    }
    if (!validPeriod) {
      setFormError('End date must be on or after the start date.')
      return
    }
    if (chosen.length === 0) {
      setFormError('Select at least one printer.')
      return
    }
    setBusy(true)
    setFormError('')
    const created = []
    const failures = []
    for (const printerCode of chosen) {
      try {
        created.push(await sendRequest('bookings/', 'POST', {
          event_code: event.code,
          printer_code: printerCode,
          nametag_type: nametagType,
          start_date: startDate,
          end_date: endDate,
        }))
      } catch (cause) {
        const printer = printers.find((candidate) => candidate.code === printerCode)
        failures.push(`Printer ${printer?.label ?? printerCode}: ${cause.message}`)
      }
    }
    if (created.length > 0) onCreated(created)
    setBusy(false)
    if (failures.length === 0) {
      onClose()
      return
    }
    setSelected(new Set())
    setFormError(`Couldn’t create ${failures.length === 1 ? 'booking' : 'bookings'}: ${failures.join('; ')}`)
  }

  return (
    <form className="form-card new-booking-panel editing" onSubmit={submit} aria-labelledby="new-booking-heading">
      <div className="section-heading">
        <div>
          <h3 id="new-booking-heading">New printer booking</h3>
          <p>
            {events && !event
              ? 'Select the event the printers should be booked for.'
              : 'Choose the period and nametag type, then select one or more available printers.'}
          </p>
        </div>
      </div>

      {events && (
        <div className="form-grid event-picker">
          <label className="field field-wide">
            <span className="field-label">Event<span className="required-mark"> *</span></span>
            <select
              disabled={busy}
              required
              value={event?.code ?? ''}
              onChange={(changeEvent) => onEventChange(changeEvent.target.value || null)}
            >
              <option value="">Select an event…</option>
              {events.map((candidate) => (
                <option key={candidate.code} value={candidate.code}>
                  {candidate.name} · {formatDateRange(candidate.start_date, candidate.end_date)}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      {event && (
      <>
      <fieldset className="form-grid" disabled={busy}>
        <Field label="Start date" value={startDate} type="date" editable required onChange={setStartDate} />
        <Field label="End date" value={endDate} type="date" editable required onChange={setEndDate} />
        <label className="field field-wide">
          <span className="field-label">Nametag type<span className="required-mark"> *</span></span>
          <select required value={nametagType} onChange={(changeEvent) => setNametagType(changeEvent.target.value)}>
            {nametagTypes.map((type) => (
              <option key={type.code} value={type.code}>{type.description || type.code}</option>
            ))}
          </select>
        </label>
      </fieldset>

      <div className="available-printers">
        <div className="available-printers-heading">
          <span className="field-label">
            Available printers {validPeriod && <span className="count-badge">{available.length}</span>}
          </span>
          {validPeriod && bookedCount > 0 && (
            <small>{bookedCount} {bookedCount === 1 ? 'printer is' : 'printers are'} already booked in this period</small>
          )}
        </div>
        {!validPeriod && <p className="list-message">Choose a valid period to see available printers.</p>}
        {validPeriod && available.length === 0 && (
          <p className="list-message">No printers are available in this period.</p>
        )}
        {validPeriod && available.length > 0 && (
          <div className="printer-options">
            {available.map((printer) => (
              <label className={`printer-option${selected.has(printer.code) ? ' selected' : ''}`} key={printer.code}>
                <input
                  checked={selected.has(printer.code)}
                  disabled={busy}
                  onChange={() => togglePrinter(printer.code)}
                  type="checkbox"
                />
                <span className="printer-icon"><Icon name="printer" size={16} /></span>
                <span className="printer-name">
                  <strong>Printer {printer.label}</strong>
                  <small>{printer.description || printer.code}</small>
                </span>
              </label>
            ))}
          </div>
        )}
      </div>
      </>
      )}

      {formError && (
        <div className="load-error action-error" role="alert">
          <span>{formError}</span>
        </div>
      )}

      <div className="new-booking-actions">
        <button className="secondary-button" disabled={busy} onClick={onClose} type="button">
          <Icon name="close" size={16} />
          Cancel
        </button>
        <button className="primary-button" disabled={busy || !event || chosen.length === 0 || !validPeriod} type="submit">
          <Icon name="check" size={16} />
          {busy
            ? 'Booking…'
            : chosen.length > 1 ? `Book ${chosen.length} printers` : 'Book printer'}
        </button>
      </div>
    </form>
  )
}

function EventEditor({
  event,
  creating = false,
  bookings,
  allBookings = [],
  printers,
  nametagTypes,
  loading,
  error,
  onCreate,
  onCreated,
  onCancelCreate,
  onUpdated,
  onDeleted,
  onBookingsCreated,
}) {
  const printerByCode = useMemo(() => new Map(printers.map((printer) => [printer.code, printer])), [printers])
  const nametagTypeByCode = useMemo(
    () => new Map(nametagTypes.map((type) => [type.code, type])),
    [nametagTypes],
  )
  const [draft, setDraft] = useState(() => (creating ? toEventDraft({}) : null))
  const [addingBooking, setAddingBooking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState('')
  const editing = draft !== null

  if (loading) {
    return (
      <main className="editor-panel" id="workspace" aria-live="polite">
        <div className="editor-placeholder">Loading event information…</div>
      </main>
    )
  }

  if (!event && !creating) {
    return (
      <main className="editor-panel" id="workspace">
        <div className="editor-placeholder">
          <h2>{error ? 'Event information unavailable' : 'No event selected'}</h2>
          <p>{error ? 'Check the API connection and try loading the data again.' : 'Select an event or create a new one.'}</p>
          {!error && (
            <button className="primary-button" onClick={onCreate} type="button">
              <Icon name="plus" size={16} />
              New event
            </button>
          )}
        </div>
      </main>
    )
  }

  const shown = creating ? draft : event
  const address = [shown.street, [shown.zip, shown.town].filter(Boolean).join(' '), shown.country]
    .filter(Boolean)
    .join(', ')

  const startEditing = () => {
    setActionError('')
    setDraft(toEventDraft(event))
  }

  const cancelEditing = () => {
    setActionError('')
    if (creating) onCancelCreate()
    else setDraft(null)
  }

  const updateDraft = (key) => (value) => setDraft((current) => ({ ...current, [key]: value }))

  const saveEvent = async (submitEvent) => {
    submitEvent.preventDefault()
    if (draft.end_date && draft.start_date && draft.end_date < draft.start_date) {
      setActionError('End date must be on or after the start date.')
      return
    }
    setBusy(true)
    setActionError('')
    try {
      if (creating) {
        const created = await sendRequest('events/', 'POST', toEventPayload(draft))
        onCreated(created)
        return
      }
      const updated = await sendRequest(`events/${encodeURIComponent(event.code)}`, 'PUT', toEventPayload(draft))
      onUpdated(updated)
      setDraft(null)
    } catch (cause) {
      setActionError(`Couldn’t ${creating ? 'create' : 'save'} event: ${cause.message}`)
    } finally {
      setBusy(false)
    }
  }

  const deleteEvent = async () => {
    const bookingNote = bookings.length > 0
      ? ` This will also delete ${bookings.length} ${bookings.length === 1 ? 'booking' : 'bookings'}.`
      : ''
    if (!window.confirm(`Delete “${event.name}”?${bookingNote} This cannot be undone.`)) return
    setBusy(true)
    setActionError('')
    try {
      await sendRequest(`events/${encodeURIComponent(event.code)}`, 'DELETE')
      onDeleted(event.code)
    } catch (cause) {
      setActionError(`Couldn’t delete event: ${cause.message}`)
      setBusy(false)
    }
  }

  const values = editing ? draft : event
  const title = creating ? draft.name.trim() || 'New event' : event.name
  return (
    <main className="editor-panel" id="workspace">
      <header className="topbar">
        <div className="breadcrumbs">
          <span>Events</span>
          <Icon name="chevron" size={15} />
          <strong>{title}</strong>
        </div>
        <span className="preview-badge"><span /> Live data</span>
      </header>

      <div className="editor-content">
        <div className="editor-title-row">
          <div>
            <p className="eyebrow">{creating ? 'New event' : 'Event details'}</p>
            <h2>{title}</h2>
            <p className="subtitle">{address || 'No address provided'}</p>
          </div>
          <div className="editor-actions">
            {editing ? (
              <>
                <button className="secondary-button" disabled={busy} onClick={cancelEditing} type="button" aria-label="Cancel editing">
                  <Icon name="close" size={16} />
                  Cancel
                </button>
                <button className="primary-button" disabled={busy} form="event-details-form" type="submit" aria-label={creating ? 'Create event' : 'Save event'}>
                  <Icon name="check" size={16} />
                  {busy ? 'Saving…' : creating ? 'Create' : 'Save'}
                </button>
              </>
            ) : (
              <>
                <button className="danger-button" disabled={busy} onClick={deleteEvent} type="button" aria-label="Delete event">
                  <Icon name="trash" size={16} />
                  {busy ? 'Deleting…' : 'Delete'}
                </button>
                <button className="primary-button" disabled={busy} onClick={startEditing} type="button" aria-label="Edit event">
                  <Icon name="edit" size={16} />
                  Edit
                </button>
              </>
            )}
          </div>
        </div>

        {actionError && (
          <div className="load-error action-error" role="alert">
            <span>{actionError}</span>
          </div>
        )}

        <form
          className={`form-card${editing ? ' editing' : ''}`}
          id="event-details-form"
          aria-labelledby="basic-details-heading"
          onSubmit={saveEvent}
        >
          <div className="section-heading">
            <div>
              <h3 id="basic-details-heading">Basic details</h3>
              <p>
                {creating
                  ? 'Fill in the event details and press Create to add the event.'
                  : editing
                    ? 'Edit the event details and press Save to apply your changes.'
                    : 'Press Edit to change the event details.'}
              </p>
            </div>
            {!creating && <span className="event-id">ID {event.id}</span>}
          </div>

          <fieldset className="form-grid" disabled={busy}>
            <Field label="Event name" value={values.name} wide editable={editing} required onChange={updateDraft('name')} />
            <Field label="Start date" value={values.start_date} type="date" editable={editing} required onChange={updateDraft('start_date')} />
            <Field label="End date" value={values.end_date} type="date" editable={editing} required onChange={updateDraft('end_date')} />
            <Field label="Street address" value={values.street} wide editable={editing} onChange={updateDraft('street')} />
            <Field label="Postcode" value={values.zip} editable={editing} onChange={updateDraft('zip')} />
            <Field label="City" value={values.town} editable={editing} onChange={updateDraft('town')} />
            <Field label="Country" value={values.country} editable={editing} onChange={updateDraft('country')} />
            {!creating && <Field label="Event code" value={event.code} />}
          </fieldset>
        </form>

        {!creating && (
        <section className="booking-section" aria-labelledby="booking-heading">
          <div className="section-heading booking-heading">
            <div>
              <h3 id="booking-heading">Printer bookings <span className="count-badge">{bookings.length}</span></h3>
              <p>Bookings associated with this event.</p>
            </div>
            {!addingBooking && (
              <button
                className="secondary-button"
                disabled={printers.length === 0 || nametagTypes.length === 0}
                onClick={() => setAddingBooking(true)}
                title={printers.length === 0 ? 'No printers exist' : nametagTypes.length === 0 ? 'No nametag types exist' : undefined}
                type="button"
              >
                <Icon name="plus" size={16} />
                New booking
              </button>
            )}
          </div>

          {addingBooking && (
            <NewBookingPanel
              allBookings={allBookings}
              event={event}
              nametagTypes={nametagTypes}
              onClose={() => setAddingBooking(false)}
              onCreated={onBookingsCreated}
              printers={printers}
            />
          )}

          {bookings.length === 0 ? (
            <div className="empty-bookings">There are no printer bookings for this event.</div>
          ) : (
            <div className="booking-table">
              <div className="booking-row booking-table-head">
                <span>PRINTER</span>
                <span>PERIOD</span>
                <span>NAMETAG TYPE</span>
                <span>BOOKING CODE</span>
              </div>
              {bookings.map((booking) => {
                const printer = printerByCode.get(booking.printer_code)
                const nametagType = nametagTypeByCode.get(booking.nametag_type)
                return (
                  <div className="booking-row" key={booking.booking_code}>
                    <span className="printer-cell">
                      <span className="printer-icon"><Icon name="printer" size={16} /></span>
                      <span className="printer-name">
                        <strong>{printer?.description || (printer ? `Printer ${printer.label}` : booking.printer_code)}</strong>
                        {printer && <small>{printer.code}</small>}
                      </span>
                    </span>
                    <span className="period-cell">
                      <Icon name="calendar" size={15} />
                      {formatDateRange(booking.start_date, booking.end_date)}
                    </span>
                    <span>{nametagType?.description || booking.nametag_type}</span>
                    <span className="code-cell">{booking.booking_code}</span>
                  </div>
                )
              })}
            </div>
          )}
        </section>
        )}
      </div>
    </main>
  )
}

const DAY_WIDTH = 34
const PRINTER_COLUMN_WIDTH = 210
const bookingColors = ['blue', 'violet', 'teal', 'amber', 'rose']

function startOfToday() {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return today
}

function addDays(date, days) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

// Calendar-day difference that is unaffected by DST changes.
function daysBetween(from, to) {
  const fromUtc = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate())
  const toUtc = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate())
  return Math.round((toUtc - fromUtc) / 86_400_000)
}

function BookingCalendar({ bookings, printers, events, nametagTypes, loading, error, onRetry, onOpenEvent, onBookingsCreated }) {
  const [addingBooking, setAddingBooking] = useState(false)
  const [bookingEventCode, setBookingEventCode] = useState(null)
  const bookableEvents = useMemo(() => getVisibleEvents(events, false), [events])
  const bookingEvent = bookableEvents.find((event) => event.code === bookingEventCode) ?? null
  const closeNewBooking = () => {
    setAddingBooking(false)
    setBookingEventCode(null)
  }
  const scrollRef = useRef(null)
  const didInitialScroll = useRef(false)
  const today = useMemo(() => startOfToday(), [])

  const eventByCode = useMemo(() => new Map(events.map((event) => [event.code, event])), [events])
  const nametagTypeByCode = useMemo(
    () => new Map(nametagTypes.map((type) => [type.code, type])),
    [nametagTypes],
  )
  const colorByEventCode = useMemo(() => {
    const sorted = [...events].sort((left, right) =>
      left.start_date.localeCompare(right.start_date) || left.name.localeCompare(right.name))
    return new Map(sorted.map((event, index) => [event.code, bookingColors[index % bookingColors.length]]))
  }, [events])

  const rows = useMemo(() => {
    const knownCodes = new Set(printers.map((printer) => printer.code))
    const orphanCodes = [...new Set(bookings.map((booking) => booking.printer_code))]
      .filter((code) => !knownCodes.has(code))
    const sortedPrinters = [...printers].sort((left, right) =>
      left.label.localeCompare(right.label, undefined, { numeric: true }))
    return [
      ...sortedPrinters.map((printer) => ({
        code: printer.code,
        title: `Printer ${printer.label}`,
        subtitle: printer.description || printer.code,
      })),
      ...orphanCodes.map((code) => ({ code, title: code, subtitle: 'Unknown printer' })),
    ].map((row) => ({
      ...row,
      bookings: bookings
        .filter((booking) => booking.printer_code === row.code)
        .sort((left, right) => left.start_date.localeCompare(right.start_date)),
    }))
  }, [bookings, printers])

  const { rangeStart, days, months } = useMemo(() => {
    let start = addDays(today, -14)
    let end = addDays(today, 120)
    for (const booking of bookings) {
      const bookingStart = parseDate(booking.start_date)
      const bookingEnd = parseDate(booking.end_date)
      if (bookingStart && bookingStart < start) start = bookingStart
      if (bookingEnd && bookingEnd > end) end = bookingEnd
    }
    start = new Date(start.getFullYear(), start.getMonth(), 1)
    end = new Date(end.getFullYear(), end.getMonth() + 1, 0)

    const dayList = Array.from({ length: daysBetween(start, end) + 1 }, (_, index) => addDays(start, index))
    const monthList = []
    for (const day of dayList) {
      const last = monthList.at(-1)
      if (last && last.month === day.getMonth() && last.year === day.getFullYear()) last.span += 1
      else monthList.push({ month: day.getMonth(), year: day.getFullYear(), date: day, span: 1 })
    }
    return { rangeStart: start, days: dayList, months: monthList }
  }, [bookings, today])

  const todayIndex = daysBetween(rangeStart, today)
  const printersBookedToday = new Set(
    bookings
      .filter((booking) => {
        const start = parseDate(booking.start_date)
        const end = parseDate(booking.end_date)
        return start && end && start <= today && today <= end
      })
      .map((booking) => booking.printer_code),
  ).size

  const scrollToDay = (index, behavior = 'smooth') => {
    scrollRef.current?.scrollTo({ left: Math.max(0, (index - 3) * DAY_WIDTH), behavior })
  }
  const scrollByWeek = (direction) => {
    scrollRef.current?.scrollBy({ left: direction * 7 * DAY_WIDTH, behavior: 'smooth' })
  }

  useEffect(() => {
    if (loading || error || didInitialScroll.current || !scrollRef.current) return
    didInitialScroll.current = true
    scrollRef.current.scrollTo({ left: Math.max(0, (todayIndex - 3) * DAY_WIDTH) })
  }, [loading, error, todayIndex])

  const monthFormat = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' })
  const weekdayFormat = new Intl.DateTimeFormat('en-GB', { weekday: 'narrow' })
  const timelineWidth = PRINTER_COLUMN_WIDTH + days.length * DAY_WIDTH

  return (
    <main className="editor-panel calendar-panel" id="workspace">
      <header className="topbar">
        <div className="breadcrumbs">
          <span>Bookings</span>
          <Icon name="chevron" size={15} />
          <strong>Printer calendar</strong>
        </div>
        <span className="preview-badge"><span /> Live data</span>
      </header>

      <div className="calendar-content">
        <div className="editor-title-row">
          <div>
            <p className="eyebrow">Bookings</p>
            <h2>Printer calendar</h2>
            <p className="subtitle">
              {rows.length} {rows.length === 1 ? 'printer' : 'printers'} · {bookings.length}{' '}
              {bookings.length === 1 ? 'booking' : 'bookings'} · {printersBookedToday} booked today
            </p>
          </div>
          <div className="editor-actions">
            <button className="secondary-button icon-only" onClick={() => scrollByWeek(-1)} type="button" aria-label="Previous week" title="Previous week">
              <Icon name="chevronLeft" size={16} />
            </button>
            <button className="secondary-button" onClick={() => scrollToDay(todayIndex)} type="button">
              Today
            </button>
            <button className="secondary-button icon-only" onClick={() => scrollByWeek(1)} type="button" aria-label="Next week" title="Next week">
              <Icon name="chevron" size={16} />
            </button>
            {!addingBooking && (
              <button
                className="primary-button"
                disabled={loading || Boolean(error) || printers.length === 0 || nametagTypes.length === 0 || bookableEvents.length === 0}
                onClick={() => setAddingBooking(true)}
                title={bookableEvents.length === 0 ? 'There are no current or upcoming events to book printers for' : undefined}
                type="button"
              >
                <Icon name="plus" size={16} />
                New booking
              </button>
            )}
          </div>
        </div>

        {addingBooking && (
          <NewBookingPanel
            allBookings={bookings}
            event={bookingEvent}
            events={bookableEvents}
            key={bookingEventCode ?? 'none'}
            nametagTypes={nametagTypes}
            onClose={closeNewBooking}
            onCreated={onBookingsCreated}
            onEventChange={setBookingEventCode}
            printers={printers}
          />
        )}

        {error && (
          <div className="load-error action-error" role="alert">
            <strong>Couldn’t load booking data</strong>
            <span>{error}</span>
            <button type="button" onClick={onRetry}>Try again</button>
          </div>
        )}

        {loading && <div className="editor-placeholder">Loading bookings…</div>}

        {!loading && !error && rows.length === 0 && (
          <div className="editor-placeholder">
            <h2>No printers</h2>
            <p>Add printers to start booking them for events.</p>
          </div>
        )}

        {!loading && !error && rows.length > 0 && (
          <div className="timeline-scroll" ref={scrollRef}>
            <div
              className="timeline"
              style={{ width: timelineWidth, '--day-width': `${DAY_WIDTH}px`, '--printer-width': `${PRINTER_COLUMN_WIDTH}px` }}
            >
              <div className="timeline-header">
                <div className="timeline-corner">Printer</div>
                <div className="timeline-scale">
                  <div className="timeline-months">
                    {months.map((month) => (
                      <div className="timeline-month" key={`${month.year}-${month.month}`} style={{ width: month.span * DAY_WIDTH }}>
                        <span>{monthFormat.format(month.date)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="timeline-days">
                    {days.map((day, index) => {
                      const weekend = day.getDay() === 0 || day.getDay() === 6
                      return (
                        <div
                          className={`timeline-day${weekend ? ' weekend' : ''}${index === todayIndex ? ' today' : ''}`}
                          key={index}
                        >
                          <small>{weekdayFormat.format(day)}</small>
                          <span>{day.getDate()}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>

              <div className="timeline-body">
                <div className="timeline-columns" aria-hidden="true">
                  {days.map((day, index) => {
                    const weekend = day.getDay() === 0 || day.getDay() === 6
                    return (
                      <span
                        className={`${weekend ? 'weekend' : ''}${index === todayIndex ? ' today' : ''}${day.getDate() === 1 ? ' month-start' : ''}`}
                        key={index}
                      />
                    )
                  })}
                </div>

                {rows.map((row) => (
                  <div className="timeline-row" key={row.code}>
                    <div className="timeline-printer">
                      <span className="printer-icon"><Icon name="printer" size={16} /></span>
                      <span className="printer-name">
                        <strong>{row.title}</strong>
                        <small>{row.subtitle}</small>
                      </span>
                    </div>
                    <div className="timeline-track">
                      {row.bookings.map((booking) => {
                        const start = parseDate(booking.start_date)
                        const end = parseDate(booking.end_date)
                        if (!start || !end) return null
                        const offset = daysBetween(rangeStart, start)
                        const span = daysBetween(start, end) + 1
                        const event = eventByCode.get(booking.event_code)
                        const nametagType = nametagTypeByCode.get(booking.nametag_type)
                        const eventName = event?.name ?? booking.event_code
                        const period = formatDateRange(booking.start_date, booking.end_date)
                        return (
                          <button
                            className={`timeline-booking ${colorByEventCode.get(booking.event_code) ?? 'blue'}`}
                            key={booking.booking_code}
                            onClick={() => onOpenEvent(booking.event_code)}
                            style={{ left: offset * DAY_WIDTH + 2, width: span * DAY_WIDTH - 4 }}
                            title={`${eventName}\n${period}\n${nametagType?.description || booking.nametag_type}\nBooking ${booking.booking_code}`}
                            type="button"
                          >
                            <strong>{eventName}</strong>
                            <span>{period}</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  )
}

function toIsoDate(date) {
  const pad = (value) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function PrinterList({ printers, bookings, events, loading, error, onRetry, onOpenEvent }) {
  const [search, setSearch] = useState('')
  const todayIso = toIsoDate(startOfToday())
  const eventByCode = useMemo(() => new Map(events.map((event) => [event.code, event])), [events])

  const rows = useMemo(() => [...printers]
    .sort((left, right) => left.label.localeCompare(right.label, undefined, { numeric: true }))
    .map((printer) => {
      const printerBookings = bookings
        .filter((booking) => booking.printer_code === printer.code)
        .sort((left, right) => left.start_date.localeCompare(right.start_date))
      return {
        printer,
        total: printerBookings.length,
        current: printerBookings.find((booking) => booking.start_date <= todayIso && todayIso <= booking.end_date),
        next: printerBookings.find((booking) => booking.start_date > todayIso),
      }
    }), [printers, bookings, todayIso])

  const query = search.trim().toLocaleLowerCase()
  const filteredRows = rows.filter(({ printer }) => !query || [printer.code, printer.label, printer.description]
    .filter(Boolean)
    .some((value) => value.toLocaleLowerCase().includes(query)))
  const bookedNow = rows.filter((row) => row.current).length

  const bookingLink = (booking) => {
    const event = eventByCode.get(booking.event_code)
    return (
      <button className="booking-link" onClick={() => onOpenEvent(booking.event_code)} type="button">
        <strong>{event?.name ?? booking.event_code}</strong>
        <small>{formatDateRange(booking.start_date, booking.end_date)}</small>
      </button>
    )
  }

  return (
    <main className="editor-panel" id="workspace">
      <header className="topbar">
        <div className="breadcrumbs">
          <span>Printers</span>
          <Icon name="chevron" size={15} />
          <strong>All printers</strong>
        </div>
        <span className="preview-badge"><span /> Live data</span>
      </header>

      <div className="editor-content printers-content">
        <div className="editor-title-row">
          <div>
            <p className="eyebrow">Inventory</p>
            <h2>Printers</h2>
            <p className="subtitle">
              {printers.length} {printers.length === 1 ? 'printer' : 'printers'} · {bookedNow} booked today ·{' '}
              {printers.length - bookedNow} available today
            </p>
          </div>
          <label className="search-field printer-search">
            <Icon name="search" size={18} />
            <input
              aria-label="Search printers"
              onChange={(changeEvent) => setSearch(changeEvent.target.value)}
              placeholder="Search printers"
              type="search"
              value={search}
            />
          </label>
        </div>

        {error && (
          <div className="load-error action-error" role="alert">
            <strong>Couldn’t load printer data</strong>
            <span>{error}</span>
            <button type="button" onClick={onRetry}>Try again</button>
          </div>
        )}

        {loading && <div className="editor-placeholder">Loading printers…</div>}

        {!loading && !error && printers.length === 0 && (
          <div className="empty-bookings">No printers have been registered yet.</div>
        )}

        {!loading && !error && printers.length > 0 && filteredRows.length === 0 && (
          <div className="empty-bookings">No printers match “{search}”.</div>
        )}

        {!loading && !error && filteredRows.length > 0 && (
          <div className="booking-table printer-table">
            <div className="printer-row booking-table-head">
              <span>PRINTER</span>
              <span>CODE</span>
              <span>STATUS TODAY</span>
              <span>NEXT BOOKING</span>
              <span>BOOKINGS</span>
            </div>
            {filteredRows.map(({ printer, total, current, next }) => (
              <div className="printer-row" key={printer.code}>
                <span className="printer-cell">
                  <span className="printer-icon"><Icon name="printer" size={16} /></span>
                  <span className="printer-name">
                    <strong>Printer {printer.label}</strong>
                    <small>{printer.description || 'No description'}</small>
                  </span>
                </span>
                <span className="code-cell">{printer.code}</span>
                <span className="status-cell">
                  {current ? (
                    <>
                      <span className="status-pill booked">Booked</span>
                      {bookingLink(current)}
                    </>
                  ) : (
                    <span className="status-pill available">Available</span>
                  )}
                </span>
                <span>{next ? bookingLink(next) : <span className="muted-cell">None scheduled</span>}</span>
                <span className="count-cell">{total}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}

export default function App() {
  const [events, setEvents] = useState([])
  const [bookings, setBookings] = useState([])
  const [printers, setPrinters] = useState([])
  const [nametagTypes, setNametagTypes] = useState([])
  const [selectedEventCode, setSelectedEventCode] = useState(null)
  const [creating, setCreating] = useState(false)
  const [showPast, setShowPast] = useState(false)
  const [view, setView] = useState('events')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    const controller = new AbortController()

    Promise.all([
      fetchCollection('events', controller.signal),
      fetchCollection('bookings', controller.signal),
      fetchCollection('printers', controller.signal),
      fetchCollection('nametag_types', controller.signal),
    ])
      .then(([nextEvents, nextBookings, nextPrinters, nextNametagTypes]) => {
        setEvents(nextEvents)
        setBookings(nextBookings)
        setPrinters(nextPrinters)
        setNametagTypes(nextNametagTypes)
        const firstEvent = getVisibleEvents(nextEvents, false)[0]
        setSelectedEventCode((currentCode) =>
          nextEvents.some((event) => event.code === currentCode) ? currentCode : firstEvent?.code ?? null)
      })
      .catch((cause) => {
        if (cause.name !== 'AbortError') {
          setError(cause instanceof Error ? cause.message : 'An unexpected error occurred while loading event data.')
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
  }, [reloadKey])

  const selectedEvent = events.find((event) => event.code === selectedEventCode) ?? null
  const selectedBookings = bookings
    .filter((booking) => booking.event_code === selectedEventCode)
    .sort((left, right) =>
      left.start_date.localeCompare(right.start_date) ||
      left.printer_code.localeCompare(right.printer_code) ||
      left.booking_code.localeCompare(right.booking_code))
  const retryLoading = () => {
    setError('')
    setLoading(true)
    setReloadKey((key) => key + 1)
  }
  const handleEventUpdated = (updated) => {
    setEvents((current) => current.map((event) => (event.code === updated.code ? updated : event)))
    // Keep the edited event visible if its new end date puts it in the past.
    if (isPastEvent(updated)) setShowPast(true)
  }
  const handleEventDeleted = (code) => {
    const remaining = events.filter((event) => event.code !== code)
    const nextEvent = getVisibleEvents(remaining, showPast)[0]
    setEvents(remaining)
    setBookings((current) => current.filter((booking) => booking.event_code !== code))
    setSelectedEventCode(nextEvent?.code ?? null)
  }
  const selectEvent = (code) => {
    setCreating(false)
    setSelectedEventCode(code)
  }
  const handleEventCreated = (created) => {
    setEvents((current) => [...current, created])
    if (isPastEvent(created)) setShowPast(true)
    setCreating(false)
    setSelectedEventCode(created.code)
  }
  const handleShowPastChange = (checked) => {
    setShowPast(checked)
    if (!checked && selectedEvent && isPastEvent(selectedEvent)) {
      setSelectedEventCode(getVisibleEvents(events, false)[0]?.code ?? null)
    }
  }

  const handleBookingsCreated = (created) => setBookings((current) => [...current, ...created])
  const openEvent = (code) => {
    const event = events.find((candidate) => candidate.code === code)
    if (event && isPastEvent(event)) setShowPast(true)
    setCreating(false)
    setSelectedEventCode(code)
    setView('events')
  }

  if (view === 'bookings') {
    return (
      <div className="app-shell single-panel">
        <Sidebar activeView={view} onNavigate={setView} />
        <BookingCalendar
          bookings={bookings}
          error={error}
          events={events}
          loading={loading}
          nametagTypes={nametagTypes}
          onOpenEvent={openEvent}
          onBookingsCreated={handleBookingsCreated}
          onRetry={retryLoading}
          printers={printers}
        />
      </div>
    )
  }

  if (view === 'printers') {
    return (
      <div className="app-shell single-panel">
        <Sidebar activeView={view} onNavigate={setView} />
        <PrinterList
          bookings={bookings}
          error={error}
          events={events}
          loading={loading}
          onOpenEvent={openEvent}
          onRetry={retryLoading}
          printers={printers}
        />
      </div>
    )
  }

  return (
    <div className="app-shell">
      <Sidebar activeView={view} onNavigate={setView} />
      <EventOverview
        bookings={bookings}
        creating={creating}
        error={error}
        events={events}
        loading={loading}
        onCreate={() => setCreating(true)}
        onRetry={retryLoading}
        onSelect={selectEvent}
        onShowPastChange={handleShowPastChange}
        selectedEventCode={selectedEventCode}
        showPast={showPast}
      />
      <EventEditor
        bookings={selectedBookings}
        creating={creating}
        error={error}
        event={selectedEvent}
        key={creating ? 'new' : selectedEventCode ?? 'none'}
        loading={loading}
        nametagTypes={nametagTypes}
        onCancelCreate={() => setCreating(false)}
        onCreate={() => setCreating(true)}
        onCreated={handleEventCreated}
        onDeleted={handleEventDeleted}
        onUpdated={handleEventUpdated}
        onBookingsCreated={handleBookingsCreated}
        allBookings={bookings}
        printers={printers}
      />
    </div>
  )
}
