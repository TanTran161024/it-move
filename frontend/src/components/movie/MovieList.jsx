import { Grid, Card, CardMedia, CardContent, Typography, CardActionArea } from '@mui/material';

export default function MovieList({ movies }) {
  return (
    <Grid container spacing={3}>
      {movies.map(movie => (
        <Grid item xs={12} sm={6} md={4} lg={3} key={movie.id}>
          <Card sx={{ bgcolor: '#23242a', color: '#fff', borderRadius: 2, transition: 'transform 0.2s', '&:hover': { transform: 'scale(1.04)', boxShadow: 6 } }}>
            <CardActionArea>
              <CardMedia component="img" height="350" image={movie.poster_url} alt={movie.title} />
              <CardContent>
                <Typography variant="h6" noWrap>{movie.title}</Typography>
                <Typography variant="body2" color="#aaa">{movie.genre}</Typography>
                <Typography variant="body2" color="#aaa">{movie.release_date}</Typography>
              </CardContent>
            </CardActionArea>
          </Card>
        </Grid>
      ))}
    </Grid>
  );
} 