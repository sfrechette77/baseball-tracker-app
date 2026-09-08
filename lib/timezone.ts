export function toLocalDateTimeInput(
  utcString: string,
  timeZone: string
): string {
  const date = new Date(utcString)

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)

  const get = (type: string) =>
    parts.find(part => part.type === type)?.value ?? ''

  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`
}

function getTimeZoneOffsetMs(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)

  const get = (type: string) =>
    Number(parts.find(part => part.type === type)?.value ?? 0)

  const localAsUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second')
  )

  return localAsUtc - date.getTime()
}

export function localDateTimeInputToUtc(
  localValue: string,
  timeZone: string
): string {
  const match = localValue.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/
  )

  if (!match) {
    throw new Error('Invalid event date and time.')
  }

  const [, year, month, day, hour, minute] = match

  const localAsUtc = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    0
  )

  let offset = getTimeZoneOffsetMs(new Date(localAsUtc), timeZone)
  let utcMs = localAsUtc - offset

  const correctedOffset = getTimeZoneOffsetMs(new Date(utcMs), timeZone)

  if (correctedOffset !== offset) {
    offset = correctedOffset
    utcMs = localAsUtc - offset
  }

  const utcString = new Date(utcMs).toISOString()

  if (toLocalDateTimeInput(utcString, timeZone) !== localValue) {
    throw new Error(
      'That local time does not exist because of a daylight-saving time change.'
    )
  }

  return utcString
}
