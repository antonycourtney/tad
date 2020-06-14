CREATE EXTERNAL TABLE `movie_metadata`(
  `color` string, 
  `director_name` string, 
  `num_critic_for_reviews` int, 
  `duration` int, 
  `director_facebook_likes` int, 
  `actor_3_facebook_likes` int, 
  `actor_2_name` string, 
  `actor_1_facebook_likes` int, 
  `gross` int, 
  `genres` string, 
  `actor_1_name` string, 
  `movie_title` string, 
  `num_voted_users` int, 
  `cast_total_facebook_likes` int, 
  `actor_3_name` string, 
  `facenumber_in_poster` int, 
  `plot_keywords` string, 
  `movie_imdb_link` string, 
  `num_user_for_reviews` int, 
  `language` string, 
  `country` string, 
  `content_rating` string, 
  `budget` int, 
  `title_year` int, 
  `actor_2_facebook_likes` int, 
  `imdb_score` double, 
  `aspect_ratio` double, 
  `movie_facebook_likes` int)
ROW FORMAT DELIMITED 
  FIELDS TERMINATED BY ',' 
STORED AS INPUTFORMAT 
  'org.apache.hadoop.mapred.TextInputFormat' 
OUTPUTFORMAT 
  'org.apache.hadoop.hive.ql.io.HiveIgnoreKeyTextOutputFormat'
LOCATION
  's3://ac-athena-test-data/uploads'
TBLPROPERTIES (
  'has_encrypted_data'='false', 
  'transient_lastDdlTime'='1590519457',
  'skip.header.line.count'='1')  