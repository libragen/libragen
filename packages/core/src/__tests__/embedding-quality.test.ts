/**
 * Embedding Quality Analysis Suite
 *
 * Comprehensive tests to evaluate the quality of embeddings for RAG applications.
 * These tests measure:
 * - Semantic similarity accuracy
 * - Code vs documentation discrimination
 * - Cross-language semantic understanding
 * - Retrieval precision and recall
 * - Embedding stability and consistency
 */

/* eslint-disable no-console, no-plusplus */
/* eslint-disable @silvermine/silvermine/no-multiline-var-declarations */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Embedder } from '../embedder.js';

describe('Embedding Quality Analysis', () => {
   let embedder: Embedder;

   beforeAll(async () => {
      embedder = new Embedder();
      await embedder.initialize();
   }, 120000);

   afterAll(async () => {
      await embedder.dispose();
   });

   /**
    * Calculate cosine similarity between two vectors
    */
   function cosineSimilarity(a: Float32Array, b: Float32Array): number {
      let dotProduct = 0,
          normA = 0,
          normB = 0;

      for (let i = 0; i < a.length; i++) {
         dotProduct += a[i] * b[i];
         normA += a[i] * a[i];
         normB += b[i] * b[i];
      }

      return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
   }

   /**
    * Calculate average similarity for a group of text pairs
    */
   async function avgSimilarity(pairs: [string, string][]): Promise<number> {
      let total = 0;

      for (const [ a, b ] of pairs) {
         const embA = await embedder.embed(a),
               embB = await embedder.embed(b);

         total += cosineSimilarity(embA, embB);
      }

      return total / pairs.length;
   }

   /**
    * Calculate retrieval metrics (precision@k, recall@k, MRR)
    */
   async function calculateRetrievalMetrics(
      query: string,
      corpus: string[],
      relevantIndices: number[],
      k: number
   ): Promise<{ precisionAtK: number; recallAtK: number; mrr: number }> {
      const queryEmb = await embedder.embed(query),
            corpusEmbs = await embedder.embedBatch(corpus);

      // Calculate similarities and rank
      const similarities = corpusEmbs.map((emb, idx) => {
         return { idx, sim: cosineSimilarity(queryEmb, emb) };
      });

      similarities.sort((a, b) => {
         return b.sim - a.sim;
      });

      const topK = similarities.slice(0, k).map((s) => {
         return s.idx;
      });

      // Precision@K: fraction of retrieved docs that are relevant
      const relevantInTopK = topK
         .filter((idx) => {
            return relevantIndices.includes(idx);
         })
         .length;

      const precisionAtK = relevantInTopK / k;

      // Recall@K: fraction of relevant docs that are retrieved
      const recallAtK = relevantInTopK / relevantIndices.length;

      // MRR: reciprocal rank of first relevant result
      let mrr = 0;

      for (let i = 0; i < similarities.length; i++) {
         if (relevantIndices.includes(similarities[i].idx)) {
            mrr = 1 / (i + 1);
            break;
         }
      }

      return { precisionAtK, recallAtK, mrr };
   }

   describe('1. Semantic Similarity Accuracy', () => {
      it('scores similar concepts higher than dissimilar ones', async () => {
         const similarPairs: [string, string][] = [
            [ 'How to sort an array', 'Array sorting algorithm' ],
            [ 'Calculate factorial', 'Factorial computation' ],
            [ 'HTTP request handling', 'Handle HTTP requests' ],
            [ 'Database connection pool', 'Connection pooling for databases' ],
            [ 'User authentication', 'Authenticate users' ],
         ];

         const dissimilarPairs: [string, string][] = [
            [ 'How to sort an array', 'Weather forecast today' ],
            [ 'Calculate factorial', 'Best pizza recipe' ],
            [ 'HTTP request handling', 'Mountain hiking trails' ],
            [ 'Database connection pool', 'Classical music composers' ],
            [ 'User authentication', 'Ocean wave patterns' ],
         ];

         const similarAvg = await avgSimilarity(similarPairs),
               dissimilarAvg = await avgSimilarity(dissimilarPairs);

         console.log('\n📊 Semantic Similarity Scores:');
         console.log(`   Similar pairs average: ${similarAvg.toFixed(4)}`);
         console.log(`   Dissimilar pairs average: ${dissimilarAvg.toFixed(4)}`);
         console.log(`   Discrimination gap: ${(similarAvg - dissimilarAvg).toFixed(4)}`);

         expect(similarAvg).toBeGreaterThan(0.7);
         expect(dissimilarAvg).toBeLessThan(0.5);
         expect(similarAvg - dissimilarAvg).toBeGreaterThan(0.3);
      });

      it('handles paraphrases correctly', async () => {
         const paraphrasePairs: [string, string][] = [
            [ 'How do I reverse a string?', 'What is the way to flip a string backwards?' ],
            [ 'Find the maximum value in an array', 'Get the largest element from a list' ],
            [ 'Convert JSON to object', 'Parse JSON string into an object' ],
            [ 'Check if number is even', 'Determine whether a number is divisible by 2' ],
            [ 'Remove duplicates from array', 'Filter out repeated elements in a list' ],
         ];

         const avgSim = await avgSimilarity(paraphrasePairs);

         console.log('\n📊 Paraphrase Recognition:');
         console.log(`   Average similarity: ${avgSim.toFixed(4)}`);

         expect(avgSim).toBeGreaterThan(0.65);
      });
   });

   describe('2. Code Understanding', () => {
      it('associates code with its description', async () => {
         const codeDescPairs: [string, string][] = [
            [
               'function factorial(n) { return n <= 1 ? 1 : n * factorial(n-1); }',
               'Calculate the factorial of a number recursively',
            ],
            [
               'const sorted = arr.sort((a, b) => a - b);',
               'Sort an array of numbers in ascending order',
            ],
            [
               'async function fetchData(url) { return await fetch(url).then(r => r.json()); }',
               'Fetch JSON data from a URL asynchronously',
            ],
            [
               'const unique = [...new Set(array)];',
               'Remove duplicate values from an array',
            ],
            [
               'str.split("").reverse().join("")',
               'Reverse a string by splitting, reversing, and joining',
            ],
         ];

         const avgSim = await avgSimilarity(codeDescPairs);

         console.log('\n📊 Code-Description Association:');
         console.log(`   Average similarity: ${avgSim.toFixed(4)}`);

         expect(avgSim).toBeGreaterThan(0.5);
      });

      it('distinguishes different programming concepts', async () => {
         const concepts = [
            'Binary search algorithm implementation',
            'Bubble sort algorithm implementation',
            'Hash table data structure',
            'Linked list data structure',
            'Depth-first search graph traversal',
         ];

         const embeddings = await embedder.embedBatch(concepts);

         // Calculate all pairwise similarities
         const similarities: number[] = [];

         for (let i = 0; i < embeddings.length; i++) {
            for (let j = i + 1; j < embeddings.length; j++) {
               similarities.push(cosineSimilarity(embeddings[i], embeddings[j]));
            }
         }

         const avgSim = similarities.reduce((a, b) => {
            return a + b;
         }, 0) / similarities.length,
               maxSim = Math.max(...similarities),
               minSim = Math.min(...similarities);

         console.log('\n📊 Concept Discrimination:');
         console.log(`   Average inter-concept similarity: ${avgSim.toFixed(4)}`);
         console.log(`   Max similarity: ${maxSim.toFixed(4)}`);
         console.log(`   Min similarity: ${minSim.toFixed(4)}`);

         // Different concepts should have moderate similarity (related but distinct)
         expect(avgSim).toBeLessThan(0.85);
         expect(avgSim).toBeGreaterThan(0.4);
      });
   });

   describe('3. Cross-Language Code Understanding', () => {
      it('recognizes equivalent code across languages', async () => {
         const crossLangPairs: [string, string][] = [
            [
               'function add(a, b) { return a + b; }', // JavaScript
               'def add(a, b): return a + b', // Python
            ],
            [
               'const nums = [1, 2, 3].map(x => x * 2);', // JavaScript
               'nums = [x * 2 for x in [1, 2, 3]]', // Python
            ],
            [
               'class Person { constructor(name) { this.name = name; } }', // JavaScript
               'class Person: def __init__(self, name): self.name = name', // Python
            ],
            [
               'arr.filter(x => x > 0)', // JavaScript
               'list(filter(lambda x: x > 0, arr))', // Python
            ],
            [
               'try { doSomething(); } catch (e) { handleError(e); }', // JavaScript
               'try: do_something() except Exception as e: handle_error(e)', // Python
            ],
         ];

         const avgSim = await avgSimilarity(crossLangPairs);

         console.log('\n📊 Cross-Language Code Recognition:');
         console.log(`   Average similarity (JS ↔ Python): ${avgSim.toFixed(4)}`);

         expect(avgSim).toBeGreaterThan(0.5);
      });
   });

   describe('4. Query-Document Retrieval Quality', () => {
      it('retrieves relevant code snippets for natural language queries', async () => {
         const corpus = [
            'function factorial(n) { return n <= 1 ? 1 : n * factorial(n-1); }',
            'function isPrime(n) { for(let i=2; i<=Math.sqrt(n); i++) if(n%i===0) return false; return n>1; }',
            'function fibonacci(n) { return n <= 1 ? n : fibonacci(n-1) + fibonacci(n-2); }',
            'function reverseString(s) { return s.split("").reverse().join(""); }',
            'function sortArray(arr) { return arr.sort((a, b) => a - b); }',
            'function findMax(arr) { return Math.max(...arr); }',
            'function removeDuplicates(arr) { return [...new Set(arr)]; }',
            'function capitalizeFirst(s) { return s.charAt(0).toUpperCase() + s.slice(1); }',
         ];

         const testCases = [
            { query: 'Calculate factorial of a number', relevant: [ 0 ] },
            { query: 'Check if number is prime', relevant: [ 1 ] },
            { query: 'Generate Fibonacci sequence', relevant: [ 2 ] },
            { query: 'Reverse a string', relevant: [ 3 ] },
            { query: 'Sort numbers in ascending order', relevant: [ 4 ] },
            { query: 'Find maximum value in array', relevant: [ 5 ] },
            { query: 'Remove duplicate elements', relevant: [ 6 ] },
         ];

         let totalMRR = 0,
             totalP1 = 0;

         console.log('\n📊 Retrieval Quality Metrics:');

         for (const { query, relevant } of testCases) {
            const metrics = await calculateRetrievalMetrics(query, corpus, relevant, 3);

            totalMRR += metrics.mrr;
            totalP1 += metrics.precisionAtK;

            console.log(`   "${query.substring(0, 30)}..." → MRR: ${metrics.mrr.toFixed(2)}, P@3: ${metrics.precisionAtK.toFixed(2)}`);
         }

         const avgMRR = totalMRR / testCases.length,
               avgP1 = totalP1 / testCases.length;

         console.log('   ─────────────────────────────────');
         console.log(`   Average MRR: ${avgMRR.toFixed(4)}`);
         console.log(`   Average P@3: ${avgP1.toFixed(4)}`);

         expect(avgMRR).toBeGreaterThan(0.7);
      });
   });

   describe('5. Embedding Stability', () => {
      it('produces consistent embeddings for identical input', async () => {
         const text = 'function calculateSum(numbers) { return numbers.reduce((a, b) => a + b, 0); }';

         const embeddings = await Promise.all([
            embedder.embed(text),
            embedder.embed(text),
            embedder.embed(text),
         ]);

         const sim01 = cosineSimilarity(embeddings[0], embeddings[1]),
               sim02 = cosineSimilarity(embeddings[0], embeddings[2]),
               sim12 = cosineSimilarity(embeddings[1], embeddings[2]);

         console.log('\n📊 Embedding Consistency:');
         console.log(`   Run 1 vs Run 2: ${sim01.toFixed(6)}`);
         console.log(`   Run 1 vs Run 3: ${sim02.toFixed(6)}`);
         console.log(`   Run 2 vs Run 3: ${sim12.toFixed(6)}`);

         // Should be essentially identical (floating point precision)
         expect(sim01).toBeGreaterThan(0.9999);
         expect(sim02).toBeGreaterThan(0.9999);
         expect(sim12).toBeGreaterThan(0.9999);
      });

      it('is robust to minor text variations', async () => {
         const variations = [
            'function add(a, b) { return a + b; }',
            'function add(a,b){return a+b;}', // No spaces
            'function add( a, b ) { return a + b; }', // Extra spaces
            'function  add(a, b) { return a + b; }', // Double space
         ];

         const embeddings = await embedder.embedBatch(variations);

         const similarities: number[] = [];

         for (let i = 1; i < embeddings.length; i++) {
            similarities.push(cosineSimilarity(embeddings[0], embeddings[i]));
         }

         const minSim = Math.min(...similarities);

         console.log('\n📊 Whitespace Robustness:');
         console.log(`   Similarities to canonical: ${similarities.map((s) => { return s.toFixed(4); }).join(', ')}`);
         console.log(`   Minimum similarity: ${minSim.toFixed(4)}`);

         expect(minSim).toBeGreaterThan(0.95);
      });
   });

   describe('6. Edge Cases', () => {
      it('handles very short text', async () => {
         const shortTexts = [ 'x', 'if', 'for', 'map', 'sort' ];

         const embeddings = await embedder.embedBatch(shortTexts);

         for (const emb of embeddings) {
            expect(emb.length).toBe(384);
            expect(emb.some((v) => { return !isNaN(v); })).toBe(true);
         }

         console.log(`\n📊 Short Text Handling: ✓ All ${shortTexts.length} short texts embedded successfully`);
      });

      it('handles long text', async () => {
         const longText = `
            /**
             * This is a very long documentation comment that describes a complex function.
             * The function performs multiple operations including data validation,
             * transformation, and persistence. It handles various edge cases and
             * provides comprehensive error handling.
             */
            async function processComplexData(input) {
               // Validate input
               if (!input || typeof input !== 'object') {
                  throw new Error('Invalid input: expected an object');
               }

               // Transform data
               const transformed = Object.entries(input).map(([key, value]) => ({
                  key: key.toLowerCase(),
                  value: typeof value === 'string' ? value.trim() : value,
                  timestamp: Date.now()
               }));

               // Persist to database
               const results = await Promise.all(
                  transformed.map(item => database.insert(item))
               );

               return {
                  success: true,
                  count: results.length,
                  items: results
               };
            }
         `
            .repeat(3); // ~3000 characters

         const embedding = await embedder.embed(longText);

         expect(embedding.length).toBe(384);
         expect(embedding.some((v) => { return !isNaN(v); })).toBe(true);

         console.log(`\n📊 Long Text Handling: ✓ ${longText.length} characters embedded successfully`);
      });

      it('handles special characters and unicode', async () => {
         const specialTexts = [
            '// Comment with émojis 🚀 and ünïcödé',
            'const λ = (x) => x * 2; // Lambda',
            '/* 日本語コメント */',
            'const π = 3.14159;',
            'function naïve() { return "café"; }',
         ];

         const embeddings = await embedder.embedBatch(specialTexts);

         for (const emb of embeddings) {
            expect(emb.length).toBe(384);
         }

         console.log(`\n📊 Special Characters: ✓ All ${specialTexts.length} texts with special chars embedded`);
      });
   });

   describe('7. Quality Summary', () => {
      it('generates overall quality report', async () => {
         // Run a comprehensive benchmark
         const benchmarkPairs: { category: string; pairs: [string, string][]; expectedMin: number }[] = [
            {
               category: 'Exact Semantic Match',
               pairs: [
                  [ 'reverse a string', 'flip a string backwards' ],
                  [ 'sort an array', 'order elements in a list' ],
               ],
               expectedMin: 0.7,
            },
            {
               category: 'Code-Description',
               pairs: [
                  [ 'arr.filter(x => x > 0)', 'filter positive numbers from array' ],
                  [ 'str.toLowerCase()', 'convert string to lowercase' ],
               ],
               expectedMin: 0.5,
            },
            {
               category: 'Negative (Should be low)',
               pairs: [
                  [ 'binary search algorithm', 'chocolate cake recipe' ],
                  [ 'database connection', 'sunset photography' ],
               ],
               expectedMin: -1, // We expect low similarity (< 0.5)
            },
         ];

         console.log(`\n${'═'.repeat(60)}`);
         console.log('📊 EMBEDDING QUALITY REPORT');
         console.log(`${'═'.repeat(60)}`);
         console.log(`Model: ${embedder.model}`);
         console.log(`Dimensions: ${embedder.dimensions}`);
         console.log(`${'─'.repeat(60)}`);

         let passedCategories = 0;

         for (const { category, pairs, expectedMin } of benchmarkPairs) {
            const avgSim = await avgSimilarity(pairs);

            const passed = expectedMin < 0
               ? avgSim < 0.5 // For negative pairs, we want LOW similarity
               : avgSim >= expectedMin;

            const status = passed ? '✓' : '✗';

            console.log(`${status} ${category}: ${avgSim.toFixed(4)} ${expectedMin >= 0 ? `(min: ${expectedMin})` : '(should be < 0.5)'}`);

            if (passed) {
               passedCategories++;
            }
         }

         console.log(`${'─'.repeat(60)}`);
         console.log(`Overall: ${passedCategories}/${benchmarkPairs.length} categories passed`);
         console.log(`${'═'.repeat(60)}\n`);

         expect(passedCategories).toBe(benchmarkPairs.length);
      });
   });
});
