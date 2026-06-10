
import pandas as pd

df = pd.read_csv("medicine_ready_for_upload.csv")
df = df.iloc[7086:]   # drop the first 7086 rows
df['generic_id'] = df['generic_id'].astype('Int64')

df.to_csv("medicine_ready_for_upload_trimmed.csv", index=False)