# flex-wrap: balance

An interactive visualizer for the line-breaking algorithm behind CSS `flex-wrap: balance`, mirroring the implementation in [WebKit](https://github.com/WebKit/WebKit/blob/74efecb8e0d1e43dea71093f25a1aab4ec9383ff/Source/WebCore/layout/formattingContexts/flex/FlexLineBreaker.cpp). View on tablet screen or larger for best experience.

![Hero](/src/assets/hero.png)

## [The Greedy Algorithm](https://drafts.csswg.org/css-flexbox-2/#layout-algorithm) (flex-wrap: wrap)

```python
def greedyLineBreaks(itemSizes: List[int], capacity: int, gap: int) -> List[int]
  lineBreaks = []
  lineStartIndex = 0

  while nextIndex < len(itemSizes):
    lineSize = 0

    for nextIndex in range(lineStartIndex, len(itemSizes)):
      firstItem = (nextIndex == lineStartIndex)

      if not firstItem and lineSize + itemSizes[nextIndex] > capacity:
        break
      lineSize += itemSizes[nextIndex] + gap

    lineBreaks.append(nextIndex)
    lineStartIndex = nextIndex
  return lineBreaks
```

With both greedy and balanced, the input is item sizes, capacity, and gap and the output is a list of indices where each line ends. In the above example, this would be `[3, 4, 5]` for greedy and `[2, 4, 5]` for balanced.

The logic for the greedy algorithm is fairly straightforward: keep adding items to a line until the line overflows. The only non-trivial bit is `not firstItem`. This is to follow the rule that each line has at least one item, even if it's bigger than capacity. Otherwise, if the next item overflows, move to the next line.

## The Core Balance Algorithm

The goal of balancing items is to homogenize the free space. To achieve this, we aim to minimize the following score:

$$\min \sum_{\texttt{lines}} \texttt{freeSpace}[\texttt{line.start}, \texttt{line.end})^2$$

Where $\texttt{start}$ and $\texttt{end}$ are both indices with $\texttt{start}$ being inclusive and $\texttt{end}$ being exclusive

$$\texttt{freeSpace}[\texttt{start}, \texttt{end}) = \max\left(0,\ \texttt{capacity} - \left((\texttt{end} - 1 - \texttt{start}) * \texttt{gap} + \sum_{i=\texttt{start}}^{\texttt{end}-1} \texttt{itemSize}[i]\right)\right)$$

### Brute Force

Naively, if we have $n$ items, we have $n-1$ break locations which gives us $O(2^n)$ possible solutions for a brute force search.

### Knuth-Plass

However, we can do better by memoizing scores for suffixes of each item, i.e. for each item $i$, memoize the best scores for the remaining $n - i$ items. This gives us an $O(n^2)$ [Dynamic Programming](https://en.wikipedia.org/wiki/Dynamic_programming) solution, see [Knuth-Plass Algorithm](https://en.wikipedia.org/wiki/Knuth%E2%80%93Plass_line-breaking_algorithm) for more background.

#### First Pass

Walking backwards through our items, for each start, we calculate the best end by finding minimum score where

$$\texttt{minScore}[\texttt{start}] = \min_{\texttt{end} \in [\texttt{start} + 1, \texttt{itemCount}]} \left( \texttt{freeSpace}[\texttt{start}, \texttt{end})^2 + \texttt{minScore}[\texttt{end}] \right)$$

We also store $\texttt{bestEnd}[\texttt{start}]$ as the last $\texttt{end}$ which achieves $\texttt{minScore}[\texttt{start}]$. We store the _last_ $\texttt{end}$ rather than any other to serve as the tie-breaker specified by the [CSS Specification](https://drafts.csswg.org/css-flexbox-2/#algo-balance).

#### Second Pass

Now we recursively look at the best line ends starting at $\texttt{start} = 0$ and updating it with $\texttt{start} = \texttt{bestEnd}[\texttt{start}]$ and adding it to our resulting list of line starts.

With this, we have found the best line breaks which minimize the sum of the squares of free space, hence achieving a balanced solution.

### Optimizations

- Since we calculate $\texttt{freeSpace}[\texttt{start}, \texttt{end})$ as the sum of the item sizes in the main $O(n^2)$ loop, we can precompute 

  $$\texttt{prefixSum}[i] = i * \texttt{gap} + \sum_{j=0}^{i-1} \texttt{itemSize}[j]$$

  This allows us to turn an $O(n)$ addition into an $O(1)$ subtraction: 

  $$\texttt{freeSpace}[\texttt{start}, \texttt{end}) = \max\left(0,\ \texttt{capacity} - (\texttt{prefixSum}[\texttt{end}] - \texttt{prefixSum}[\texttt{start}] - \texttt{gap})\right)$$

- When looping through the ends for each start, if we overflow the capacity (red boxes), we break immediately and mark the rest as impossible. This is because all item sizes are non-negative so we'll stay above capacity with more items.

  With this, we can further decrease our time complexity to $O(n * L)$ where $L$ is the average line length. In the typical case, $L << n$ and hence, we can typically achieve near $O(n)$, down from the $O(2^n)$ of brute force. Incredible!

## Other Interactions

### [flex-line-count]((https://drafts.csswg.org/css-flexbox-2/#flex-line-count-property))
The CSS Specification also calls for this new CSS property in tandem with `flex-wrap: balance` which specifies the minimum number of lines that the items should occupy while also being balanced.

This adds an extra dimension to the Dynamic Programming Algorithm that's not captured by this visualizer because now we must find the most balanced solution across 

$$\texttt{numLines} \in [\min(\texttt{flex-line-count},\ \texttt{numItems}),\ \texttt{numItems}]$$
