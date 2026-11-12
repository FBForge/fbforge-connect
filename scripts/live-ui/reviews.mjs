// Independent feature groups continue after a failure. No operation is retried and no failure is hidden.
export async function independentReviews(reviews, reportFailure) {
  const result = { passed: [], failed: [] };
  for (const review of reviews) {
    try {
      await review.run();
      result.passed.push(review.label);
    } catch (error) {
      result.failed.push(review.label);
      await reportFailure(review.label, error);
    }
  }
  return result;
}
