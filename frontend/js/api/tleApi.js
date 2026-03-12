export async function fetchTLE(norad){

 const url=`https://celestrak.org/NORAD/elements/gp.php?CATNR=${norad}&FORMAT=TLE`;

 const res=await fetch(url);
 const text=await res.text();

 const lines=text.trim().split("\n");

 return{
  name:lines[0],
  tle1:lines[1],
  tle2:lines[2]
 }

}