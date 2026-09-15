# flex-wrap: balance

An interactive visualizer for the line-breaking algorithm behind CSS `flex-wrap: balance`, mirroring the implementation in [WebKit](https://github.com/WebKit/WebKit/blob/74efecb8e0d1e43dea71093f25a1aab4ec9383ff/Source/WebCore/layout/formattingContexts/flex/FlexLineBreaker.cpp). See the [CSS Specification](https://drafts.csswg.org/css-flexbox-2/#algo-balance).

## The Algorithm

The goal of balancing items is to homogenize the free space. To achieve this, we aim to minimize the following "score":

$$\min \sum_{line} \texttt{freeSpace}[\texttt{line.start}, \texttt{line.end})^2$$

Where $\texttt{start}$ and $\texttt{end}$ are both indices and 

$$\texttt{freeSpace}[\texttt{start}, \texttt{end}) = \max\left(0,\ \texttt{capacity} - \left((\texttt{end} - 1 - \texttt{start}) * \texttt{gap} + \sum_{i=\texttt{start}}^{\texttt{end}-1} \texttt{itemSize}[i]\right)\right)$$

### Brute Force

Naively, if we have $n$ items, we have $n-1$ break locations which gives us $O(2^n)$ possible solutions for a brute force search.

### Knuth-Plass

However, we can do better by memoizing scores for suffixes of each item, i.e. for each item $i$, memoize the best scores for the remaining $n - i$ items. This gives us an $O(n^2)$ [Dynamic Programming](https://en.wikipedia.org/wiki/Dynamic_programming) solution, see [Knuth-Plass Algorithm](https://en.wikipedia.org/wiki/Knuth%E2%80%93Plass_line-breaking_algorithm) for more background.

#### First Pass

Walking backwards through our items, for each start, we calculate the best end by finding minimum score where

$$\texttt{minScore}[\texttt{start}] = \min_{\texttt{end} \in [\texttt{start} + 1, \texttt{itemCount}]} \left( \texttt{freeSpace}[\texttt{start}, \texttt{end})^2 + \texttt{minScore}[\texttt{end}] \right)$$

We also store 

#### Second Pass

Now we recursively look at the best line ends starting at $\texttt{start} = 0$ and updating it with $\texttt{start} = \text{bestEndForStart}[\texttt{start}]$ and adding it to our resulting list of line starts.

### Optimizations

- Since we calculate $\texttt{freeSpace}[\texttt{start}, \texttt{end})$ as the sum of the item sizes in the main $O(n^2)$ loop, we can precompute 

  $$\texttt{prefixSum}[i] = i * \texttt{gap} + \sum_{j=0}^{i-1} \texttt{itemSize}[j]$$

  This allows us to turn an $O(n)$ addition into an $O(1)$ subtraction: 

  $$\texttt{freeSpace}[\texttt{start}, \texttt{end}) = \max\left(0,\ \texttt{capacity} - (\texttt{prefixSum}[\texttt{end}] - \texttt{prefixSum}[\texttt{start}] - \texttt{gap})\right)$$

-  When looping through the ends for each start, if we overflow the capacity (red boxes), we break immediately and mark the rest of the row as impossible since all item sizes are non-negative so we'll stay above capacity for any larger rows.

### Rules
- At least one item is assigned to each line, even if that single item overflows the line by itself.
- Other than the case of a single overflowing item, the sum of the item sizes does not exceed the inner main size, i.e. the capacity.
- To tie-break, prefer adding items to earlier lines. Ex. if both [3, 2] and [2, 3] have the same score items per line, prefer 3 items in the first line.

See the [CSS Specification](https://drafts.csswg.org/css-flexbox-2/#algo-balance) for exact wording.