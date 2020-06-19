SELECT "_path0", "_sortVal_0_0", "director_name", "movie_title"
FROM 
    (SELECT "country" AS "_path0",
         sum("title_year") AS "_sortVal_0_0",
         sum("gross") AS "_sortVal_0_1"
    FROM "imdb_top_rated"
    GROUP BY  "country") t1 LEFT OUTER
JOIN 
    (SELECT "country" AS "_path0",
         "director_name",
         "movie_title"
    FROM "imdb_top_rated") t2
USING ("_path0")