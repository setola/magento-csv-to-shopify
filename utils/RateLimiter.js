/**
 * Rate Limiter utility
 * Manages concurrent requests and delays between API calls
 */

import pLimit from 'p-limit';

export default class RateLimiter {
  constructor(config, logger) {
    this.config = config;
    this.log = logger;
    this.limiter = pLimit(config.maxConcurrent);
  }

  // Create a rate-limited task
  limit(task) {
    return this.limiter(task);
  }

  // Delay utility
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Execute tasks with rate limiting and progress tracking
  async executeTasks(tasks, progressCallback = null) {
    const results = [];
    const errors = [];

    // Execute all tasks with rate limiting
    const limitedTasks = tasks.map((task, index) =>
      this.limiter(async () => {
        try {
          const result = await task();
          
          // Add delay between requests if configured
          if (this.config.delayBetweenRequests) {
            await this.delay(this.config.delayBetweenRequests);
          }

          results.push({ index, result, success: true });
          
          // Call progress callback if provided
          if (progressCallback) {
            progressCallback(index + 1, tasks.length, null);
          }

          return result;
        } catch (error) {
          errors.push({ index, error });
          results.push({ index, error, success: false });
          
          // Call progress callback with error if provided
          if (progressCallback) {
            progressCallback(index + 1, tasks.length, error);
          }

          // Log the error but don't throw (let other tasks continue)
          this.log(`Task ${index} failed: ${error.message}`, 'ERROR');
          return null;
        }
      })
    );

    // Wait for all tasks to complete
    await Promise.all(limitedTasks);

    return {
      results,
      errors,
      successCount: results.filter(r => r.success).length,
      errorCount: errors.length,
      totalTasks: tasks.length
    };
  }

  // Simple batch processor with rate limiting
  async processBatch(items, processor, batchCallback = null) {
    const tasks = items.map((item, index) => 
      () => processor(item, index)
    );

    return await this.executeTasks(tasks, batchCallback);
  }
}