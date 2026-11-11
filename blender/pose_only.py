"""Iteración rápida de poses: abre out/<nombre>/s3b.blend (malla ya texturada y unida por finish.py) y ejecuta poses.py.
Uso: python blender/pose_only.py ventura   (requiere haber corrido finish.py al menos una vez)"""
import bpy, os, sys, bmesh, json, math, numpy as np
HERE=os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0,HERE); from common import render, out_dir
from mathutils import Vector, Matrix
from style import STYLES
NAME=sys.argv[1]; OUT=out_dir(NAME); STY=STYLES[NAME]; K=STY['H']/1.687
bpy.ops.wm.open_mainfile(filepath=OUT+'s3b.blend')
b=bpy.data.objects['Human']; rig=bpy.data.objects['Human.rig']; me=b.data
exec(open(os.path.join(HERE,'poses.py'),encoding='utf-8').read())
