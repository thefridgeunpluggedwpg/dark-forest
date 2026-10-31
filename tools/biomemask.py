# Builds js/biomemask.js: 512x512 land-biome grid derived from assets/ref/full_4608.jpg
from PIL import Image; import numpy as np, base64
from PIL import ImageDraw
from scipy import ndimage as nd
N=512; S=N/900
im=np.asarray(Image.open('assets/ref/full_4608.jpg').convert('RGB').resize((N,N),Image.BOX)).astype(float)
R,G,Bc=im[...,0],im[...,1],im[...,2]; sm=R+G+Bc; sat=im.max(2)-im.min(2)
yy,xx=np.mgrid[0:N,0:N]
def ell(cx,cy,rx,ry): return ((xx-cx*S)/(rx*S))**2+((yy-cy*S)/(ry*S))**2<1
def poly(pts):
  m=Image.new('L',(N,N),0); ImageDraw.Draw(m).polygon([(x*S,y*S) for x,y in pts],fill=1); return np.asarray(m).astype(bool)
M=np.full((N,N),2,np.uint8)  # meadow
dark=(sm<125)&(G>=R)
M[dark]=3
forest=poly([(260,60),(480,40),(470,250),(330,250),(260,160)])|poly([(690,300),(850,300),(860,560),(700,540)])|ell(90,515,50,70)
M[forest&(sm<150)]=3
swamp=poly([(50,330),(200,250),(430,290),(440,470),(410,560),(450,700),(420,820),(250,800),(120,700),(40,560)])&~ell(325,520,85,55)&~ell(90,515,45,60)
M[swamp]=4
M[swamp&(sm>370)&(G>=R)&(G>Bc+30)]=13
haunt=ell(455,410,110,85)&(sm<150)|ell(455,400,70,55); M[haunt]=8
jungle=poly([(480,575),(560,540),(700,545),(790,560),(820,690),(720,810),(600,800),(480,720)]); M[jungle]=10
mtn={'snowN':(225,185,115,75),'n':(400,125,70,60),'c':(480,240,55,65),'w':(160,300,75,50),'e':(715,475,75,55),'s':(465,725,60,60),'tan':(705,285,65,45)}
for k,(cx,cy,rx,ry) in mtn.items():
  e=ell(cx,cy,rx,ry); rock=nd.binary_fill_holes(nd.binary_closing(e&(sat<48)&(sm>150),iterations=3))&e if k!='snowN' else e&((sat<45)&(sm>330)|(sat<30)&(sm>200))
  if k=='snowN': rock2=e&~((G>R+6)&(G>Bc+20)); M[rock2]=5; M[rock]=11
  else: M[rock]=5
volc=poly([(490,190),(560,95),(610,72),(660,80),(760,175),(785,265),(700,285),(580,285),(495,262)]); M[volc]=9
M[volc&(R>140)&(R>G+45)]=12
# smooth: mode filter 5x5 except lava/pools
def mode(a):
  out=a.copy(); best=np.zeros(a.shape)
  for v in np.unique(a):
    c=nd.uniform_filter((a==v).astype(float),5)
    sel=c>best; out[sel]=v; best[sel]=c[sel]
  return out
lp=(M==12)|(M==13); keep=M.copy(); M=mode(M); M[lp]=keep[lp]
# RLE encode -> base64 of (value,runlen<=255) pairs
f=M.ravel(); out=bytearray(); i=0
while i<len(f):
  j=i
  while j<len(f) and f[j]==f[i] and j-i<255: j+=1
  out+=bytes([f[i],j-i]); i=j
open('js/biomemask.js','w').write("// v0.13: land biome per tile, classified from assets/ref/full_4608.jpg (tools/biomemask.py). 2=meadow 3=woods 4=swamp 5=rock 8=haunted 9=volcano 10=jungle 11=snow 12=lava 13=toxic pool. RLE pairs.\nexport const BIOME_B64='"+base64.b64encode(bytes(out)).decode()+"';\n")
pal={2:(110,150,50),3:(20,70,30),4:(80,90,50),5:(130,130,130),8:(20,20,20),9:(60,40,40),10:(0,160,60),11:(255,255,255),12:(255,90,0),13:(150,255,0)}
img=np.zeros((N,N,3),np.uint8)
for v,c in pal.items(): img[M==v]=c
Image.fromarray(img).save('mask_debug.png'); print(len(out))
