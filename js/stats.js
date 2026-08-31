// Jensen-Shannon divergence over 25th-Knesset party vote-share vectors,
// used to find the locality most similar in voting pattern to the answer.
// JSD is chosen over plain KL divergence because it is symmetric and bounded
// ([0, ln(2)] in nats, [0, 1] in bits), and it needs no ad-hoc smoothing for
// parties with zero votes in a given locality (KL is undefined at p=0 unless
// artificially smoothed). See AGENTS.md for details.
(function (global) {
  function voteShareVector(votes, partyLetters) {
    const total = partyLetters.reduce((sum, letter) => sum + (votes[letter] || 0), 0) || 1;
    return partyLetters.map((letter) => (votes[letter] || 0) / total);
  }

  function klTerm(p, q) {
    let sum = 0;
    for (let i = 0; i < p.length; i++) {
      if (p[i] <= 0) continue; // 0 * log(0/x) := 0
      sum += p[i] * Math.log2(p[i] / q[i]);
    }
    return sum;
  }

  function jsDivergence(p, q) {
    const m = p.map((v, i) => (v + q[i]) / 2);
    return (klTerm(p, m) + klTerm(q, m)) / 2;
  }

  function findMostSimilarLocality(answerId, results25, partyLetters) {
    const target = voteShareVector(results25[answerId].votes, partyLetters);
    let bestId = null;
    let bestDist = Infinity;
    for (const id of Object.keys(results25)) {
      if (id === answerId) continue;
      const vec = voteShareVector(results25[id].votes, partyLetters);
      const dist = jsDivergence(target, vec);
      if (dist < bestDist) {
        bestDist = dist;
        bestId = id;
      }
    }
    return { id: bestId, divergence: bestDist };
  }

  global.Stats = { voteShareVector, jsDivergence, findMostSimilarLocality };
})(window);
