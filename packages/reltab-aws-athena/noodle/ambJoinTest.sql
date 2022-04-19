SELECT t1."country", "sum_gross", "director_name", "movie_title"
FROM 
    (SELECT "country",
         sum("gross") AS "sum_gross"
    FROM "imdb_top_rated"
    GROUP BY  "country") t1 LEFT OUTER
JOIN 
    (SELECT "country",
         "director_name",
         "movie_title"
    FROM "imdb_top_rated") t2
USING ("country")