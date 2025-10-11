/**
 * TimeTracker utility class for tracking elapsed time and formatting durations
 */
class TimeTracker {
  constructor() {
    this.startTime = Date.now();
    this.lastLapTime = this.startTime;
    this.lapCount = 0;
  }

  /**
   * Get the total elapsed time since start
   * @returns {number} Elapsed time in milliseconds
   */
  getElapsedTime() {
    return Date.now() - this.startTime;
  }

  /**
   * Get the lap time since last lap or start
   * @returns {number} Lap time in milliseconds
   */
  getLapTime() {
    const currentTime = Date.now();
    const lapTime = currentTime - this.lastLapTime;
    this.lastLapTime = currentTime;
    this.lapCount++;
    return lapTime;
  }

  /**
   * Get lap time without updating the lap timer
   * @returns {number} Current lap time in milliseconds
   */
  peekLapTime() {
    return Date.now() - this.lastLapTime;
  }

  /**
   * Format milliseconds to human readable format (e.g., "2m 30s" or "45s")
   * @param {number} milliseconds - Time in milliseconds
   * @returns {string} Formatted time string
   */
  static formatTime(milliseconds) {
    const seconds = Math.round(milliseconds / 1000);
    if (seconds < 60) {
      return `${seconds}s`;
    }
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  }

  /**
   * Get formatted elapsed time since start
   * @returns {string} Formatted elapsed time
   */
  getFormattedElapsedTime() {
    return TimeTracker.formatTime(this.getElapsedTime());
  }

  /**
   * Get formatted lap time and update lap timer
   * @returns {string} Formatted lap time
   */
  getFormattedLapTime() {
    return TimeTracker.formatTime(this.getLapTime());
  }

  /**
   * Get formatted lap time without updating the lap timer
   * @returns {string} Formatted current lap time
   */
  getFormattedPeekLapTime() {
    return TimeTracker.formatTime(this.peekLapTime());
  }

  /**
   * Calculate average time per item for a batch
   * @param {number} itemCount - Number of items processed
   * @param {number} timeMs - Time taken in milliseconds (optional, uses current lap time if not provided)
   * @returns {number} Average time per item in milliseconds
   */
  getAverageTimePerItem(itemCount, timeMs = null) {
    const time = timeMs !== null ? timeMs : this.peekLapTime();
    return itemCount > 0 ? Math.round(time / itemCount) : 0;
  }

  /**
   * Get comprehensive timing stats
   * @param {number} itemsProcessed - Number of items processed in current lap
   * @returns {Object} Object with timing statistics
   */
  getTimingStats(itemsProcessed = 10) {
    const currentTime = Date.now();
    const lapTime = currentTime - this.lastLapTime;
    const totalElapsed = currentTime - this.startTime;
    
    return {
      lapTime,
      lapTimeFormatted: TimeTracker.formatTime(lapTime),
      totalElapsed,
      totalElapsedFormatted: TimeTracker.formatTime(totalElapsed),
      avgTimePerItem: this.getAverageTimePerItem(itemsProcessed, lapTime),
      timestamp: currentTime
    };
  }

  /**
   * Update lap timer (call this after getting timing stats to prepare for next lap)
   */
  updateLapTimer() {
    this.lastLapTime = Date.now();
    this.lapCount++;
  }

  /**
   * Reset the timer to start over
   */
  reset() {
    this.startTime = Date.now();
    this.lastLapTime = this.startTime;
    this.lapCount = 0;
  }

  /**
   * Get the start time
   * @returns {number} Start time in milliseconds
   */
  getStartTime() {
    return this.startTime;
  }
}

export default TimeTracker;
