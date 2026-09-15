# flex-wrap: balance

An interactive visualizer for the line-breaking algorithm behind CSS `flex-wrap: balance`,
mirroring the implementation in WebCore.

```bash
npm install
npm run dev
```

## The Algorithm

The goal of balancing items is to homogenize the free space. To achieve this, we aim to minimize the following "score":

$$\min \sum_{line} \texttt{freeSpace}[line.start, line.end)^2$$

Where $\texttt{start}$ and $\texttt{end}$ are both indeces and $\texttt{freeSpace}[\texttt{start}, \texttt{end}) = \texttt{capacity} - [(\texttt{end} - \texttt{start} - 1) * \texttt{gap} + \sum_{i=\texttt{start}}^{\texttt{end}-1} \texttt{itemSize}[i]]$.

### Brute Force

Naively, if we have $n$ items, we have $n-1$ break locations which gives us $O(2^n)$ possible solutions for a brute force search.

### Knuth-Plass

However, we can do better by memoizing scores for subsets of items, giving us an $O(n^2)$ [Dynamic Programming](https://en.wikipedia.org/wiki/Dynamic_programming) solution, see [Knuth-Plass Algorithm](https://en.wikipedia.org/wiki/Knuth%E2%80%93Plass_line-breaking_algorithm).

#### First Pass

Walking backwards through our items for each start, we calculate the best end by finding minimum score where

$$\texttt{minScore}[\texttt{start}] = \min_{\texttt{end} \in [\texttt{start} + 1, \texttt{itemCount}]} \left( \texttt{freeSpace}[\texttt{start}, \texttt{end})^2 + \texttt{minScore}[\texttt{end}] \right)$$

#### Second Pass

Now we know the best end for $\texttt{minScore}[0]$, in our case this is {minScore[0]}. Because it is in column {bestEndForStart[0]}, our next row starts there. We then repeat this, finding the column with the lowest score and using that as our next start until we run out of items.

### Optimizations

1. Since we calculate $\texttt{freeSpace}[\texttt{start}, \texttt{end})$ as the sum of the item sizes in the main $O(n^2)$ loop, we can precompute 

$$\texttt{prefixSum}[i] = i * \texttt{gap} + \sum_{j=0}^{i-1} \texttt{itemSize}[j]$$

This allows us to turn an $O(n)$ addition into an $O(1)$ subtraction: 

$$\texttt{freeSpace}[\texttt{start}, \texttt{end}) = \texttt{capacity} - (\texttt{prefixSum}[\texttt{end}] - \texttt{prefixSum}[\texttt{start}] - \texttt{gap})$$

2. When looping through the ends for each start, if we overflow the capacity (red boxes), we break immediatly and mark the rest of the row as impossible since all item sizes are non-negative so we'll stay above capacity for any larger rows.
