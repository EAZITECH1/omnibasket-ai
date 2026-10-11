/**
 * Market Hours Sentinel
 * Calculates whether traditional US equity markets (NYSE/NASDAQ) are open or closed,
 * and tracks the 24/7 on-chain trading window on BNB Smart Chain.
 */
export function getMarketHoursStatus() {
  const now = new Date();

  // Convert to US Eastern Time (EST/EDT) safely via formatToParts
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: false
  });

  const parts = Object.fromEntries(formatter.formatToParts(now).map(p => [p.type, p.value]));
  const hours = parseInt(parts.hour, 10) % 24;
  const minutes = parseInt(parts.minute, 10);
  const weekday = parts.weekday; // 'Sun', 'Mon', 'Tue', etc.

  const isWeekend = weekday === 'Sat' || weekday === 'Sun';
  const currentMinutesFromMidnight = hours * 60 + minutes;

  // Market hours: 9:30 AM (570 mins) to 4:00 PM (960 mins)
  const marketOpenMins = 9 * 60 + 30; // 9:30 AM
  const marketCloseMins = 16 * 60;     // 4:00 PM

  const isWeekdayMarketHours =
    !isWeekend &&
    currentMinutesFromMidnight >= marketOpenMins &&
    currentMinutesFromMidnight < marketCloseMins;

  let session = 'Closed (After-Hours)';
  let message = 'TradFi is closed. BNB Smart Chain tokenized stocks continue trading 24/7.';

  if (isWeekend) {
    session = 'Weekend Freeze (NYSE Closed)';
    message = 'Wall Street is dark until Monday 9:30 AM EST. Tokenized equities are trading live on BSC with continuous price discovery.';
  } else if (isWeekdayMarketHours) {
    session = 'Regular Market Hours (Open)';
    message = 'NYSE & NASDAQ are actively trading with live reference feeds.';
  } else if (currentMinutesFromMidnight < marketOpenMins) {
    session = 'Pre-Market Session';
    message = 'US pre-market. Early trading on BSC actively anticipating opening bell.';
  }

  const nyTimeFormatted = now.toLocaleTimeString('en-US', {
    timeZone: 'America/New_York',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  });

  return {
    isOpen: isWeekdayMarketHours,
    isClosed: !isWeekdayMarketHours,
    isWeekend,
    session,
    message,
    nyTime: nyTimeFormatted,
    onChainActive: true // BSC never sleeps
  };
}
